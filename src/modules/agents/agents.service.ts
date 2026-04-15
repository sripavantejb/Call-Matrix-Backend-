import { prisma } from '../../config/database.js';

export async function createAgent(
  userId: string,
  input: { agentName: string; prompt: string; voice: string; language: string },
) {
  return prisma.agent.create({
    data: {
      userId,
      agentName: input.agentName.trim(),
      prompt: input.prompt,
      voice: input.voice.trim(),
      language: input.language.trim(),
    },
  });
}

export async function listAgentsForUser(userId: string) {
  return prisma.agent.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function deleteAgentForUser(agentId: string, userId: string) {
  const agent = await prisma.agent.findFirst({
    where: { id: agentId, userId },
  });
  if (!agent) {
    return { deleted: false as const };
  }
  await prisma.agent.delete({ where: { id: agentId } });
  return { deleted: true as const };
}
