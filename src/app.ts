import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import { Redis } from 'ioredis';
import pino from 'pino';
import type { Logger } from 'pino';
import type { Env } from './config/env.js';
import plugins from './plugins/index.js';
import { getCache, setCache } from './utils/cache.js';
import { sendSuccess } from './utils/response.js';

declare module 'fastify' {
  interface FastifyInstance {
    redis: InstanceType<typeof Redis> | null;
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
  redis: InstanceType<typeof Redis> | null,
  logger: Logger,
) {
  const fastify = Fastify({
    loggerInstance: logger,
    requestIdHeader: 'x-request-id',
    genReqId: () => randomUUID(),
  });

  fastify.decorate('redis', redis);

  await fastify.register(plugins, { env });

  fastify.get('/health', async (_request, reply) => {
    sendSuccess(reply, { status: 'ok' }, 'OK');
  });

  fastify.get('/redis-test', async (request, reply) => {
    const key = typeof request.query === 'object' && request.query !== null
      ? (request.query as Record<string, unknown>).key
      : undefined;
    const ttl = typeof request.query === 'object' && request.query !== null
      ? (request.query as Record<string, unknown>).ttl
      : undefined;

    const cacheKey = typeof key === 'string' && key.trim() !== '' ? key : 'redis:test:key';
    const ttlSeconds = typeof ttl === 'string' ? Number.parseInt(ttl, 10) : 5;
    const safeTtl = Number.isFinite(ttlSeconds) && ttlSeconds > 0 ? ttlSeconds : 5;

    const cached = await getCache<{ value: string; cachedAt: string }>(cacheKey);
    if (cached) {
      request.log.info({ cacheKey }, 'CACHE HIT');
      sendSuccess(reply, { source: 'cache', ...cached }, 'OK');
      return;
    }

    request.log.info({ cacheKey }, 'CACHE MISS');
    const payload = {
      value: 'some_value',
      cachedAt: new Date().toISOString(),
    };
    await setCache(cacheKey, payload, safeTtl);
    sendSuccess(reply, { source: 'db-fallback', ...payload }, 'OK');
  });

  return fastify;
}
