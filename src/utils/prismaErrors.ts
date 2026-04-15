import { Prisma } from '@prisma/client';

/** True when Prisma cannot reach or initialize the database (wrong URL, server down, etc.). */
export function isDatabaseConnectionError(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    return ['P1000', 'P1001', 'P1017'].includes(err.code);
  }
  if (err instanceof Prisma.PrismaClientInitializationError) {
    return true;
  }
  return false;
}
