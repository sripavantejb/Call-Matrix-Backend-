import { randomUUID } from 'node:crypto';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import type { FastifyError } from 'fastify';
import Fastify from 'fastify';
import type { Logger } from 'pino';
import { prisma } from './config/database.js';
import type { Env } from './config/env.js';
import { redisClient } from './config/redis.js';
import { authMiddleware } from './middleware/authMiddleware.js';
import { requireRole } from './middleware/roleMiddleware.js';
import { adminRoutes } from './modules/admin/admin.routes.js';
import { agentsRoutes } from './modules/agents/agents.routes.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { callsRoutes } from './modules/calls/calls.routes.js';
import { campaignsRoutes } from './modules/campaigns/campaigns.routes.js';
import { usersRoutes } from './modules/users/users.routes.js';

function isFastifyError(err: unknown): err is FastifyError {
  return (
    typeof err === 'object' &&
    err !== null &&
    'statusCode' in err &&
    typeof (err as FastifyError).statusCode === 'number'
  );
}

export async function buildApp(env: Env, logger: Logger) {
  const app = Fastify({
    loggerInstance: logger,
    requestIdHeader: 'x-request-id',
    genReqId: () => randomUUID(),
  });

  await app.register(helmet, { global: true });

  const corsOrigin =
    env.CORS_ORIGIN !== undefined
      ? env.CORS_ORIGIN
      : env.NODE_ENV === 'development';

  await app.register(cors, {
    origin: corsOrigin,
  });

  await app.register(jwt, {
    secret: env.JWT_SECRET,
    sign: {
      expiresIn: env.JWT_EXPIRES_IN,
    },
  });

  app.get('/health', async () => {
    let dbOk = false;
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbOk = true;
    } catch {
      dbOk = false;
    }
    const redisOk = redisClient.status === 'ready';
    return {
      status: 'ok',
      database: dbOk,
      redis: redisOk,
    };
  });

  await app.register(async (authScope) => {
    await authScope.register(rateLimit, {
      max: env.AUTH_RATE_LIMIT_MAX,
      timeWindow: env.AUTH_RATE_LIMIT_WINDOW_MS,
      redis: redisClient,
      nameSpace: 'rl:auth:',
    });
    await authRoutes(authScope, env);
  });

  await app.register(async (api) => {
    await api.register(rateLimit, {
      max: env.RATE_LIMIT_MAX,
      timeWindow: env.RATE_LIMIT_WINDOW_MS,
      redis: redisClient,
      nameSpace: 'rl:api:',
    });

    api.addHook('preHandler', authMiddleware);

    await usersRoutes(api);

    await api.register(async (adminScope) => {
      adminScope.addHook('preHandler', requireRole('admin'));
      await adminRoutes(adminScope, env);
    });

    await api.register(async (tenantScope) => {
      tenantScope.addHook('preHandler', requireRole('user'));
      await agentsRoutes(tenantScope);
      await campaignsRoutes(tenantScope);
      await callsRoutes(tenantScope);
    });
  });

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, 'request failed');

    const statusCode = isFastifyError(error) ? (error.statusCode ?? 500) : 500;

    if (statusCode === 429) {
      reply.status(429).send({ message: 'Too many requests' });
      return;
    }

    if (statusCode >= 400 && statusCode < 500) {
      const message = error instanceof Error ? error.message : 'Request failed';
      reply.status(statusCode).send({ message });
      return;
    }

    if (env.NODE_ENV === 'production') {
      reply.status(500).send({ message: 'Internal Server Error' });
      return;
    }

    const wrapped = error instanceof Error ? error : new Error(String(error));
    reply.status(500).send({
      message: wrapped.message,
      stack: wrapped.stack,
    });
  });

  return app;
}
