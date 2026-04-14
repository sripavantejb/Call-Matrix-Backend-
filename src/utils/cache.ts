import { redisClient } from '../config/redis.js';

const CACHE_OPERATION_TIMEOUT_MS = 750;

function logCacheError(action: string, key: string, error: unknown): void {
  console.error(`[cache] ${action} failed for key "${key}"`, error);
}

async function withTimeout<T>(operation: Promise<T>): Promise<T> {
  let timeoutId: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Cache operation timed out after ${CACHE_OPERATION_TIMEOUT_MS}ms`));
    }, CACHE_OPERATION_TIMEOUT_MS);
  });

  try {
    return await Promise.race([operation, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

export async function setCache<T>(
  key: string,
  value: T,
  ttlSeconds?: number,
): Promise<boolean> {
  if (!redisClient) {
    return false;
  }

  try {
    const payload = JSON.stringify(value);
    if (typeof ttlSeconds === 'number' && Number.isFinite(ttlSeconds) && ttlSeconds > 0) {
      await withTimeout(redisClient.set(key, payload, 'EX', Math.floor(ttlSeconds)));
      return true;
    }

    await withTimeout(redisClient.set(key, payload));
    return true;
  } catch (error) {
    logCacheError('set', key, error);
    return false;
  }
}

export async function getCache<T>(key: string): Promise<T | null> {
  if (!redisClient) {
    return null;
  }

  try {
    const raw = await withTimeout(redisClient.get(key));
    if (raw === null) {
      return null;
    }

    return JSON.parse(raw) as T;
  } catch (error) {
    logCacheError('get', key, error);
    return null;
  }
}

export async function deleteCache(key: string): Promise<boolean> {
  if (!redisClient) {
    return false;
  }

  try {
    const deleted = await withTimeout(redisClient.del(key));
    return deleted > 0;
  } catch (error) {
    logCacheError('delete', key, error);
    return false;
  }
}
