import type { UserRole, UserStatus } from '@prisma/client';

declare module 'fastify' {
  interface FastifyRequest {
    currentUser: {
      id: string;
      name: string;
      email: string;
      role: UserRole;
      status: UserStatus;
      company: string;
      plan: string;
    };
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      sub: string;
      role: UserRole;
      email: string;
    };
    user: {
      sub: string;
      role: UserRole;
      email: string;
    };
  }
}
