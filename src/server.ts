import { connectMongo, disconnectMongo } from './config/db.js';
import { loadEnv } from './config/env.js';
import { closeRedis, createRedisClient } from './config/redis.js';
import { buildApp, createLogger } from './app.js';

const SHUTDOWN_TIMEOUT_MS = 30_000;

let shuttingDown = false;

async function shutdown(
  signal: string,
  server: Awaited<ReturnType<typeof buildApp>>,
  logger: ReturnType<typeof createLogger>,
): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  const log = logger.child({ component: 'shutdown' });
  log.info({ signal }, 'graceful shutdown started');

  const forceExit = setTimeout(() => {
    log.error('graceful shutdown timed out; exiting');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);

  try {
    await server.close();
    log.info('HTTP server closed');

    await disconnectMongo(logger);
    await closeRedis(server.redis, logger);
  } catch (err) {
    log.error({ err }, 'error during shutdown');
    process.exit(1);
  } finally {
    clearTimeout(forceExit);
  }

  log.info('shutdown complete');
  process.exit(0);
}

async function main(): Promise<void> {
  const env = loadEnv();
  const logger = createLogger(env);

  await connectMongo(env, logger);
  const redis = createRedisClient(env, logger);
  await redis.ping();
  const server = await buildApp(env, redis, logger);

  try {
    await server.listen({ port: env.PORT, host: '0.0.0.0' });
    logger.info({ port: env.PORT }, 'server listening');
  } catch (err) {
    logger.error({ err }, 'failed to start server');
    await disconnectMongo(logger).catch(() => {});
    await closeRedis(redis, logger).catch(() => {});
    process.exit(1);
  }

  const onSignal = (signal: string) => {
    void shutdown(signal, server, logger);
  };

  process.once('SIGINT', () => {
    onSignal('SIGINT');
  });
  process.once('SIGTERM', () => {
    onSignal('SIGTERM');
  });
}

void main().catch((err: unknown) => {
  console.error('fatal error during startup', err);
  process.exit(1);
});
