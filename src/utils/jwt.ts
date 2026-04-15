import type { FastifyInstance } from 'fastify';
import type { UserRole } from '@prisma/client';

export function signUserAccessToken(
  app: FastifyInstance,
  input: { userId: string; role: UserRole; email: string },
  expiresIn: string,
): string {
  return app.jwt.sign(
    { sub: input.userId, role: input.role, email: input.email },
    { expiresIn },
  );
}
