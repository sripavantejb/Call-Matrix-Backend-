import { Redis } from 'ioredis';
import type { Logger } from 'pino';
import type { Env } from './env.js';

const QUIT_TIMEOUT_MS = 10_000;

export function createRedisClient(
  env: Env,
  logger: Logger,
): InstanceType<typeof Redis> {
  const log = logger.child({ component: 'redis' });

  const client = new Redis(env.REDIS_URL, {
    retryStrategy(times: number) {
      return Math.min(times * 50, 2000);
    },
    maxRetriesPerRequest: null,
    enableOfflineQueue: false,
    lazyConnect: false,
  });

  client.on('connect', () => {
    log.info('Redis connected');
  });

  client.on('ready', () => {
    log.debug('Redis ready');
  });

  client.on('reconnecting', (delay: number) => {
    log.warn({ delayMs: delay }, 'Redis reconnecting');
  });

  client.on('error', (err: Error) => {
    log.error({ err }, 'Redis client error');
  });

  client.on('close', () => {
    log.warn('Redis connection closed');
  });

  client.on('end', () => {
    log.info('Redis connection ended');
  });

  return client;
}

export async function closeRedis(
  client: InstanceType<typeof Redis>,
  logger: Logger,
): Promise<void> {
  const log = logger.child({ component: 'redis' });
  if (client.status === 'end') {
    return;
  }

  const quitPromise = client.quit();
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Redis quit timed out after ${QUIT_TIMEOUT_MS}ms`));
    }, QUIT_TIMEOUT_MS);
  });

  try {
    await Promise.race([quitPromise, timeout]);
    log.info('Redis disconnected gracefully');
  } catch (err) {
    log.warn({ err }, 'Redis quit failed; forcing disconnect');
    client.disconnect();
    throw err;
  }
}
