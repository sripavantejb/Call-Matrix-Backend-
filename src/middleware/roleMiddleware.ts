import type { UserRole } from '@prisma/client';
import type { FastifyReply, FastifyRequest } from 'fastify';

export function requireRole(...roles: UserRole[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.currentUser) {
      reply.status(401).send({ message: 'Unauthorized' });
      return;
    }
    if (!roles.includes(request.currentUser.role)) {
      reply.status(403).send({ message: 'Forbidden' });
      return;
    }
  };
}
