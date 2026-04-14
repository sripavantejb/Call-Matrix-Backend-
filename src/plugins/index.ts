import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import type { FastifyError } from 'fastify';
import fp from 'fastify-plugin';
import type { Env } from '../config/env.js';
import { sendError } from '../utils/response.js';

export interface CorePluginsOptions {
  env: Env;
}

function isFastifyError(err: unknown): err is FastifyError {
  return (
    typeof err === 'object' &&
    err !== null &&
    'statusCode' in err &&
    typeof (err as FastifyError).statusCode === 'number'
  );
}

function hasValidation(
  err: unknown,
): err is FastifyError & { validation: unknown } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'validation' in err &&
    (err as { validation?: unknown }).validation !== undefined
  );
}

function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}

export default fp<CorePluginsOptions>(
  async (fastify, opts) => {
    const { env } = opts;

    await fastify.register(helmet, {
      global: true,
    });

    const corsOrigin =
      env.CORS_ORIGIN !== undefined
        ? env.CORS_ORIGIN
        : env.NODE_ENV === 'development';

    await fastify.register(cors, {
      origin: corsOrigin,
    });

    await fastify.register(rateLimit, {
      max: env.RATE_LIMIT_MAX,
      timeWindow: env.RATE_LIMIT_WINDOW_MS,
    });

    fastify.addHook('onResponse', (request, reply, done) => {
      request.log.info(
        {
          req: {
            method: request.method,
            url: request.url,
            id: request.id,
          },
          res: {
            statusCode: reply.statusCode,
          },
          responseTimeMs: reply.elapsedTime,
        },
        'request completed',
      );
      done();
    });

    fastify.setErrorHandler((error, request, reply) => {
      request.log.error({ err: error }, 'request failed');

      if (hasValidation(error)) {
        sendError(
          reply,
          'Validation failed',
          'VALIDATION_ERROR',
          error.validation,
          400,
        );
        return;
      }

      const statusCode = isFastifyError(error)
        ? (error.statusCode ?? 500)
        : 500;

      if (statusCode === 429) {
        sendError(
          reply,
          'Too many requests',
          'RATE_LIMIT_EXCEEDED',
          undefined,
          429,
        );
        return;
      }

      if (statusCode >= 400 && statusCode < 500) {
        const wrapped = toError(error);
        const message = wrapped.message || 'Request failed';
        const code = isFastifyError(error)
          ? String(error.code ?? 'CLIENT_ERROR')
          : 'CLIENT_ERROR';
        sendError(reply, message, code, undefined, statusCode);
        return;
      }

      if (env.NODE_ENV === 'production') {
        sendError(
          reply,
          'Internal Server Error',
          'INTERNAL_ERROR',
          undefined,
          500,
        );
        return;
      }

      const wrapped = toError(error);
      sendError(
        reply,
        wrapped.message || 'Internal Server Error',
        isFastifyError(error)
          ? String(error.code ?? 'INTERNAL_ERROR')
          : 'INTERNAL_ERROR',
        { stack: wrapped.stack },
        statusCode,
      );
    });
  },
  { name: 'core-plugins' },
);
