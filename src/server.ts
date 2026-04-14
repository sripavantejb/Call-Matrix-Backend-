import { connectMongo, disconnectMongo } from './config/db.js';
import { loadEnv, type Env } from './config/env.js';
import {
  closeRedisConnection,
  redisClient,
  registerRedisShutdownHooks,
  setRedisLogger,
} from './config/redis.js';
import { buildApp, createLogger } from './app.js';
import { formatKillHint, getListeningPids } from './utils/listen-port-hint.js';

const SHUTDOWN_TIMEOUT_MS = 30_000;

function isAddrInUse(err: unknown): err is NodeJS.ErrnoException & { port?: number } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as NodeJS.ErrnoException).code === 'EADDRINUSE'
  );
}

async function logPortInUseHint(
  err: unknown,
  env: Env,
  logger: ReturnType<typeof createLogger>,
): Promise<void> {
  if (!isAddrInUse(err)) {
    return;
  }
  const port =
    typeof err.port === 'number' && Number.isFinite(err.port) ? err.port : env.PORT;
  const pids = await getListeningPids(port);
  const killHint = formatKillHint(pids);
  logger.warn(
    {
      component: 'startup',
      bindPort: port,
      suspectedListeningPids: pids.length > 0 ? pids : undefined,
      resolvePortConflictHint: killHint,
    },
    'address already in use — another process may be listening on this port',
  );
}

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
    await closeRedisConnection();
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
  setRedisLogger(logger);
  registerRedisShutdownHooks();

  await connectMongo(env, logger);
  const server = await buildApp(env, redisClient, logger);

  try {
    await server.listen({ port: env.PORT, host: env.HOST });
    logger.info({ port: env.PORT, host: env.HOST }, 'server listening');
  } catch (err) {
    logger.error({ err }, 'failed to start server');
    await logPortInUseHint(err, env, logger);
    logger.info(
      { component: 'startup' },
      'releasing MongoDB and Redis after failed bind (common cause: port already in use — stop the other process or change PORT)',
    );
    await disconnectMongo(logger).catch(() => {});
    await closeRedisConnection().catch(() => {});
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
