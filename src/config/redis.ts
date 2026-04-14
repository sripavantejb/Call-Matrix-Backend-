import { Redis } from 'ioredis';
import type { Logger } from 'pino';

const REDIS_RETRY_BASE_MS = 200;
const REDIS_RETRY_MAX_MS = 30_000;
const REDIS_QUIT_TIMEOUT_MS = 10_000;

let appLogger: Logger | null = null;
let shutdownHooksBound = false;
let isClosing = false;

const redisUrl = process.env.REDIS_URL?.trim();

function logInfo(message: string, payload?: Record<string, unknown>): void {
  if (appLogger) {
    appLogger.child({ component: 'redis' }).info(payload ?? {}, message);
    return;
  }
  if (payload) {
    console.info(message, payload);
    return;
  }
  console.info(message);
}

function logWarn(message: string, payload?: Record<string, unknown>): void {
  if (appLogger) {
    appLogger.child({ component: 'redis' }).warn(payload ?? {}, message);
    return;
  }
  if (payload) {
    console.warn(message, payload);
    return;
  }
  console.warn(message);
}

function logError(message: string, payload?: Record<string, unknown>): void {
  if (appLogger) {
    appLogger.child({ component: 'redis' }).error(payload ?? {}, message);
    return;
  }
  if (payload) {
    console.error(message, payload);
    return;
  }
  console.error(message);
}

function getRetryDelay(times: number): number {
  return Math.min(
    REDIS_RETRY_BASE_MS * 2 ** Math.max(0, Math.min(times - 1, 10)),
    REDIS_RETRY_MAX_MS,
  );
}

function createClient(): InstanceType<typeof Redis> | null {
  if (!redisUrl) {
    logWarn('REDIS_URL is not configured; cache layer is disabled');
    return null;
  }

  const client = new Redis(redisUrl, {
    lazyConnect: true,
    enableOfflineQueue: true,
    maxRetriesPerRequest: null,
    retryStrategy(times: number): number {
      const delay = getRetryDelay(times);
      logWarn('Redis reconnect attempt scheduled', { attempt: times, delayMs: delay });
      return delay;
    },
  });

  client.on('connect', () => {
    logInfo('Redis connection established');
  });

  client.on('error', (error: Error) => {
    logError('Redis client error', { error });
  });

  client.on('reconnecting', (delayMs: number) => {
    logWarn('Redis reconnecting', { delayMs });
  });

  void client.connect().catch((error: unknown) => {
    logError('Initial Redis connect failed; continuing without cache', { error });
  });

  return client;
}

export const redisClient: InstanceType<typeof Redis> | null = createClient();

async function quitWithTimeout(client: InstanceType<typeof Redis>): Promise<void> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Redis quit timed out after ${REDIS_QUIT_TIMEOUT_MS}ms`));
    }, REDIS_QUIT_TIMEOUT_MS);
  });

  await Promise.race([client.quit(), timeoutPromise]);
}

export function setRedisLogger(logger: Logger): void {
  appLogger = logger;
}

export async function closeRedisConnection(): Promise<void> {
  if (!redisClient || redisClient.status === 'end' || isClosing) {
    return;
  }

  isClosing = true;
  try {
    await quitWithTimeout(redisClient);
    logInfo('Redis connection closed gracefully');
  } catch (error) {
    logWarn('Redis graceful quit failed; disconnecting forcefully', { error });
    redisClient.disconnect();
  } finally {
    isClosing = false;
  }
}

export function registerRedisShutdownHooks(): void {
  if (shutdownHooksBound) {
    return;
  }
  shutdownHooksBound = true;

  const onSignal = (signal: string): void => {
    void closeRedisConnection()
      .catch((error: unknown) => {
        logError('Redis close failed during signal handling', { signal, error });
      })
      .finally(() => {
        logInfo(`Redis shutdown handler finished for ${signal}`);
      });
  };

  process.once('SIGINT', () => {
    onSignal('SIGINT');
  });

  process.once('SIGTERM', () => {
    onSignal('SIGTERM');
  });
}
