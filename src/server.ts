import { loadEnv } from './config/env.js';
import { createLogger } from './config/logger.js';
import { disconnectPrisma } from './config/database.js';
import {
  closeRedisConnection,
  redisClient,
  registerRedisShutdownHooks,
  setRedisLogger,
} from './config/redis.js';
import { buildApp } from './app.js';
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
  env: ReturnType<typeof loadEnv>,
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

    await disconnectPrisma();
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

async function verifyRedis(logger: ReturnType<typeof createLogger>): Promise<void> {
  const log = logger.child({ component: 'redis' });
  try {
    await redisClient.ping();
    log.info('Redis ping ok');
  } catch (err) {
    log.error({ err }, 'Redis ping failed — rate limiting requires Redis');
    throw err;
  }
}

async function main(): Promise<void> {
  const env = loadEnv();
  const logger = createLogger(env);
  logger.info({ env: env.NODE_ENV }, 'environment loaded');
  setRedisLogger(logger);
  registerRedisShutdownHooks();

  await verifyRedis(logger);

  const server = await buildApp(env, logger);

  const maxPortAttempts = env.NODE_ENV === 'development' ? 10 : 1;
  let listenErr: unknown;

  for (let offset = 0; offset < maxPortAttempts; offset++) {
    const tryPort = env.PORT + offset;
    try {
      await server.listen({ port: tryPort, host: env.HOST });
      if (offset > 0) {
        logger.warn(
          {
            configuredPort: env.PORT,
            boundPort: tryPort,
          },
          'listening on alternate port (configured port was busy); point VITE_API_URL at this port or stop the other process',
        );
      }
      logger.info({ port: tryPort, host: env.HOST }, 'server listening');
      listenErr = undefined;
      break;
    } catch (err) {
      listenErr = err;
      if (!isAddrInUse(err)) {
        break;
      }
      if (offset === maxPortAttempts - 1) {
        break;
      }
      logger.warn({ port: tryPort, tryNext: tryPort + 1 }, 'port busy, retrying');
    }
  }

  if (listenErr !== undefined) {
    logger.error({ err: listenErr }, 'failed to start server');
    await logPortInUseHint(listenErr, env, logger);
    await disconnectPrisma().catch(() => {});
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
