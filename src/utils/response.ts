import type { FastifyReply } from 'fastify';

export function sendSuccess<T>(
  reply: FastifyReply,
  data: T,
  message: string,
  statusCode = 200,
): void {
  reply.status(statusCode).send({
    success: true,
    message,
    data,
  });
}

export function sendError(
  reply: FastifyReply,
  message: string,
  code: string,
  details?: unknown,
  statusCode = 500,
): void {
  const body: {
    success: false;
    message: string;
    error: { code: string; details?: unknown };
  } = {
    success: false,
    message,
    error: { code },
  };
  if (details !== undefined) {
    body.error.details = details;
  }
  reply.status(statusCode).send(body);
}
