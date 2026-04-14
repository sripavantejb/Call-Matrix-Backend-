import { deleteCache, getCache, setCache } from '../utils/cache.js';

type UserProfile = {
  id: string;
  name: string;
  email: string;
};

async function getUserProfileFromDatabase(userId: string): Promise<UserProfile> {
  return {
    id: userId,
    name: 'Fallback User',
    email: 'fallback.user@example.com',
  };
}

export async function getUserProfileWithCache(userId: string): Promise<UserProfile> {
  const cacheKey = `user:profile:${userId}`;

  const cached = await getCache<UserProfile>(cacheKey);
  if (cached) {
    return cached;
  }

  const fromDb = await getUserProfileFromDatabase(userId);
  await setCache(cacheKey, fromDb, 300);
  return fromDb;
}

export async function cacheExample(): Promise<void> {
  const key = 'example:health';

  await setCache(key, { status: 'ok', service: 'call-matrix' }, 60);
  const value = await getCache<{ status: string; service: string }>(key);

  if (!value) {
    const fallback = { status: 'fallback', service: 'call-matrix' };
    await setCache(key, fallback, 30);
  }

  await deleteCache(key);
}
