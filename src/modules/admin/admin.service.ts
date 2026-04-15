import type { UserRole, UserStatus } from '@prisma/client';
import { prisma } from '../../config/database.js';
import type { Env } from '../../config/env.js';
import {
  generateApiKey,
  generateApiSecret,
  generateReadablePassword,
} from '../../utils/credentialGenerator.js';
import { hashPassword } from '../../utils/hash.js';

export async function createSaaSUser(
  input: { name: string; email: string; company: string; plan: string },
  env: Env,
): Promise<{
  user: { id: string; name: string; email: string; company: string; plan: string };
  password: string;
  apiKey: string;
  apiSecret: string;
}> {
  const email = input.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw Object.assign(new Error('Email already registered'), { code: 'EMAIL_TAKEN' });
  }

  const password = generateReadablePassword();
  const passwordHash = await hashPassword(password, env);
  const apiKey = generateApiKey();
  const apiSecret = generateApiSecret();
  const apiSecretHash = await hashPassword(apiSecret, env);

  const user = await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: {
        name: input.name.trim(),
        email,
        passwordHash,
        role: 'user',
        company: input.company.trim(),
        plan: input.plan.trim(),
        status: 'active',
      },
    });

    await tx.apiCredential.create({
      data: {
        userId: u.id,
        apiKey,
        apiSecretHash,
        label: 'initial',
      },
    });

    return u;
  });

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      company: user.company,
      plan: user.plan,
    },
    password,
    apiKey,
    apiSecret,
  };
}

export async function listAllUsers() {
  return prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      company: true,
      plan: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function updateUserById(
  id: string,
  patch: {
    name?: string;
    company?: string;
    plan?: string;
    status?: UserStatus;
    role?: UserRole;
  },
  actorId: string,
): Promise<void> {
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) {
    throw Object.assign(new Error('User not found'), { code: 'NOT_FOUND' });
  }

  if (patch.role !== undefined && patch.role !== target.role) {
    if (id === actorId && target.role === 'admin' && patch.role === 'user') {
      const adminCount = await prisma.user.count({ where: { role: 'admin' } });
      if (adminCount <= 1) {
        throw Object.assign(new Error('Cannot demote the last admin'), { code: 'LAST_ADMIN' });
      }
    }
  }

  await prisma.user.update({
    where: { id },
    data: {
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.company !== undefined ? { company: patch.company.trim() } : {}),
      ...(patch.plan !== undefined ? { plan: patch.plan.trim() } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.role !== undefined ? { role: patch.role } : {}),
    },
  });
}

export async function setUserStatus(userId: string, status: UserStatus) {
  await prisma.user.update({
    where: { id: userId },
    data: { status },
  });
}

export async function deleteUserById(userId: string) {
  await prisma.user.delete({ where: { id: userId } });
}

export async function resetUserPassword(userId: string, env: Env): Promise<{ password: string }> {
  const password = generateReadablePassword();
  const passwordHash = await hashPassword(password, env);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash },
  });
  return { password };
}

export type UsageRow = {
  userId: string;
  email: string;
  callCount: number;
  totalDuration: number;
};

export async function getUsageAnalytics(from?: Date, to?: Date): Promise<{
  totalCalls: number;
  totalDuration: number;
  callsByUser: UsageRow[];
}> {
  const dateWhere =
    from !== undefined || to !== undefined
      ? {
          createdAt: {
            gte: from ?? new Date(0),
            lte: to ?? new Date(),
          },
        }
      : {};

  const calls = await prisma.call.findMany({
    where: dateWhere,
    select: {
      duration: true,
      campaign: {
        select: {
          userId: true,
          user: { select: { email: true } },
        },
      },
    },
  });

  let totalDuration = 0;
  const map = new Map<string, { email: string; callCount: number; totalDuration: number }>();

  for (const c of calls) {
    totalDuration += c.duration;
    const uid = c.campaign.userId;
    const email = c.campaign.user.email;
    const cur = map.get(uid) ?? { email, callCount: 0, totalDuration: 0 };
    cur.callCount += 1;
    cur.totalDuration += c.duration;
    map.set(uid, cur);
  }

  const callsByUser = [...map.entries()]
    .map(([userId, v]) => ({
      userId,
      email: v.email,
      callCount: v.callCount,
      totalDuration: v.totalDuration,
    }))
    .sort((a, b) => b.callCount - a.callCount);

  return {
    totalCalls: calls.length,
    totalDuration,
    callsByUser,
  };
}
