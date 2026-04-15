import { prisma } from '../../config/database.js';

export async function listCallsForUser(
  userId: string,
  filters: { campaignId?: string; from?: Date; to?: Date },
) {
  const dateFilter =
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
      campaign: {
        userId,
        ...(filters.campaignId !== undefined ? { id: filters.campaignId } : {}),
      },
      ...dateFilter,
    },
    orderBy: { createdAt: 'desc' },
    include: {
      campaign: {
        select: {
          id: true,
          campaignName: true,
        },
      },
    },
  });
}
