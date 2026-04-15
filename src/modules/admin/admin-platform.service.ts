import { prisma } from '../../config/database.js';

export async function getDashboardStats() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [
    totalUsers,
    activeUsers,
    totalCalls,
    callsLast30Days,
    totalCampaigns,
    totalAgents,
    durationSum,
    durationLast30,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { status: 'active' } }),
    prisma.call.count(),
    prisma.call.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
    prisma.campaign.count(),
    prisma.agent.count(),
    prisma.call.aggregate({ _sum: { duration: true } }),
    prisma.call.aggregate({
      where: { createdAt: { gte: thirtyDaysAgo } },
      _sum: { duration: true },
    }),
  ]);

  return {
    totalUsers,
    activeUsers,
    totalCalls,
    callsLast30Days,
    totalCampaigns,
    totalAgents,
    systemUsageMinutes: durationSum._sum.duration ?? 0,
    talkTimeLast30DaysMinutes: durationLast30._sum.duration ?? 0,
  };
}

export async function listAllAgentsAdmin() {
  return prisma.agent.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      user: { select: { id: true, email: true, name: true, company: true } },
    },
  });
}

export async function deleteAgentByIdAdmin(id: string) {
  await prisma.agent.delete({ where: { id } });
}

export async function listAllCampaignsAdmin() {
  return prisma.campaign.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      user: { select: { id: true, email: true, name: true } },
      agent: { select: { id: true, agentName: true } },
    },
  });
}

export async function deleteCampaignByIdAdmin(id: string) {
  await prisma.campaign.delete({ where: { id } });
}

export async function listAllCallsAdmin(filters: {
  from?: Date;
  to?: Date;
  userId?: string;
  campaignId?: string;
}) {
  const dateWhere =
    filters.from !== undefined || filters.to !== undefined
      ? {
          createdAt: {
            gte: filters.from ?? new Date(0),
            lte: filters.to ?? new Date(),
          },
        }
      : {};

  return prisma.call.findMany({
    where: {
      ...dateWhere,
      ...(filters.campaignId ? { campaignId: filters.campaignId } : {}),
      ...(filters.userId
        ? { campaign: { userId: filters.userId } }
        : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 500,
    include: {
      campaign: {
        select: {
          id: true,
          campaignName: true,
          userId: true,
          user: { select: { email: true, name: true } },
        },
      },
    },
  });
}

export async function getAdminAnalytics(from?: Date, to?: Date) {
  const dateWhere =
    from !== undefined || to !== undefined
      ? {
          createdAt: {
            gte: from ?? new Date(0),
            lte: to ?? new Date(),
          },
        }
      : {};

  const calls = await prisma.call.findMany({
    where: dateWhere,
    select: {
      duration: true,
      createdAt: true,
      callStatus: true,
      campaign: {
        select: {
          id: true,
          campaignName: true,
          status: true,
          userId: true,
          user: { select: { email: true } },
        },
      },
    },
  });

  const callsByDay = new Map<string, number>();
  const callsByUser = new Map<
    string,
    { email: string; callCount: number; totalDuration: number }
  >();
  const campaignStats = new Map<
    string,
    { name: string; callCount: number; status: string }
  >();

  for (const c of calls) {
    const day = c.createdAt.toISOString().slice(0, 10);
    callsByDay.set(day, (callsByDay.get(day) ?? 0) + 1);

    const uid = c.campaign.userId;
    const email = c.campaign.user.email;
    const u = callsByUser.get(uid) ?? { email, callCount: 0, totalDuration: 0 };
    u.callCount += 1;
    u.totalDuration += c.duration;
    callsByUser.set(uid, u);

    const cid = c.campaign.id;
    const cs =
      campaignStats.get(cid) ?? {
        name: c.campaign.campaignName,
        callCount: 0,
        status: c.campaign.status,
      };
    cs.callCount += 1;
    campaignStats.set(cid, cs);
  }

  const agentCount = await prisma.agent.count({
    where:
      from !== undefined || to !== undefined
        ? {
            createdAt: {
              gte: from ?? new Date(0),
              lte: to ?? new Date(),
            },
          }
        : undefined,
  });

  const callsPerDay = [...callsByDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }));

  const callsPerUser = [...callsByUser.entries()].map(([userId, v]) => ({
    userId,
    email: v.email,
    callCount: v.callCount,
    totalDuration: v.totalDuration,
  }));

  const campaignPerformance = [...campaignStats.values()].sort(
    (a, b) => b.callCount - a.callCount,
  );

  return {
    callsPerDay,
    callsPerUser,
    agentsCreatedInRange: agentCount,
    campaignPerformance,
    totalCalls: calls.length,
    totalDuration: calls.reduce((s, c) => s + c.duration, 0),
  };
}
