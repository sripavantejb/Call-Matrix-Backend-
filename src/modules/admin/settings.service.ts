import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';

const defaultConfig: Prisma.JsonObject = {
  defaultPlans: ['starter', 'pro', 'enterprise'],
  callLimits: { maxConcurrentPerTenant: 10 },
  apiLimits: { requestsPerMinute: 1000 },
};

export async function getOrCreatePlatformSettings(): Promise<Prisma.JsonObject> {
  const row = await prisma.platformSettings.findFirst();
  if (row) {
    return row.config as Prisma.JsonObject;
  }
  const created = await prisma.platformSettings.create({
    data: { config: defaultConfig },
  });
  return created.config as Prisma.JsonObject;
}

export async function mergePlatformSettings(
  patch: Record<string, unknown>,
): Promise<Prisma.JsonObject> {
  const current = await getOrCreatePlatformSettings();
  const merged = { ...current, ...patch } as Prisma.JsonObject;
  const first = await prisma.platformSettings.findFirst();
  if (!first) {
    const row = await prisma.platformSettings.create({ data: { config: merged } });
    return row.config as Prisma.JsonObject;
  }
  const updated = await prisma.platformSettings.update({
    where: { id: first.id },
    data: { config: merged as Prisma.JsonObject },
  });
  return updated.config as Prisma.JsonObject;
}
