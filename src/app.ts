import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';
import pino from 'pino';
import type { Logger } from 'pino';
import type { Env } from './config/env.js';
import plugins from './plugins/index.js';
import { sendSuccess } from './utils/response.js';

declare module 'fastify' {
  interface FastifyInstance {
    redis: InstanceType<typeof Redis>;
  }
}

export function createLogger(env: Env): Logger {
  if (env.NODE_ENV === 'development') {
    return pino({
      level: 'debug',
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
        },
      },
    });
  }
  return pino({ level: 'info' });
}

export async function buildApp(
  env: Env,
  redis: InstanceType<typeof Redis>,
  logger: Logger,
): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger,
    requestIdHeader: 'x-request-id',
    genReqId: () => randomUUID(),
  });

  fastify.decorate('redis', redis);

  await fastify.register(plugins, { env });

  fastify.get('/health', async (_request, reply) => {
    sendSuccess(reply, { status: 'ok' }, 'OK');
  });

  return fastify;
}
