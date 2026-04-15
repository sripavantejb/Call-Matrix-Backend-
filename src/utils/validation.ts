import type { FastifyReply } from 'fastify';
import type { z } from 'zod';

export function parseBody<T>(
  schema: z.ZodSchema<T>,
  body: unknown,
  reply: FastifyReply,
): T | null {
  const result = schema.safeParse(body);
  if (!result.success) {
    reply.status(400).send({
      message: 'Validation failed',
      issues: result.error.flatten(),
    });
    return null;
  }
  return result.data;
}

export function parseQuery<T>(
  schema: z.ZodSchema<T>,
  query: unknown,
  reply: FastifyReply,
): T | null {
  const result = schema.safeParse(query);
  if (!result.success) {
    reply.status(400).send({
      message: 'Validation failed',
      issues: result.error.flatten(),
    });
    return null;
  }
  return result.data;
}
