import { CampaignStatus } from '@prisma/client';
import { prisma } from '../../config/database.js';

export async function createCampaign(
  userId: string,
  input: { campaignName: string; agentId: string },
) {
  const agent = await prisma.agent.findFirst({
    where: { id: input.agentId, userId },
  });
  if (!agent) {
    return { ok: false as const, reason: 'agent_not_found' as const };
  }

  const campaign = await prisma.campaign.create({
    data: {
      userId,
      agentId: input.agentId,
      campaignName: input.campaignName.trim(),
      status: CampaignStatus.draft,
    },
  });

  return { ok: true as const, campaign };
}

export async function listCampaignsForUser(userId: string) {
  return prisma.campaign.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    include: {
      agent: {
        select: { id: true, agentName: true },
      },
    },
  });
}

export async function setCampaignStatus(
  userId: string,
  campaignId: string,
  status: CampaignStatus,
) {
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, userId },
  });
  if (!campaign) {
    return { ok: false as const };
  }

  const updated = await prisma.campaign.update({
    where: { id: campaignId },
    data: { status },
  });

  return { ok: true as const, campaign: updated };
}
