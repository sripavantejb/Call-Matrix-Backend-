import type { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../config/database.js';

export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    await request.jwtVerify();
  } catch {
    reply.status(401).send({ message: 'Unauthorized' });
    return;
  }

  const sub = request.user.sub;
  const user = await prisma.user.findUnique({ where: { id: sub } });

  if (!user) {
    reply.status(401).send({ message: 'Unauthorized' });
    return;
  }

  if (user.status !== 'active') {
    reply.status(403).send({ message: 'Account disabled' });
    return;
  }

  request.currentUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    company: user.company,
    plan: user.plan,
  };
}
