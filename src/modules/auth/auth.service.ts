import type { User } from '@prisma/client';
import { prisma } from '../../config/database.js';
import type { Env } from '../../config/env.js';
import { verifyPassword } from '../../utils/hash.js';

export type LoginResult =
  | { ok: true; user: User }
  | { ok: false; reason: 'invalid_credentials' | 'disabled' };

export async function loginWithPassword(
  email: string,
  password: string,
  _env: Env,
): Promise<LoginResult> {
  const normalized = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: normalized } });

  if (!user) {
    return { ok: false, reason: 'invalid_credentials' };
  }

  const match = await verifyPassword(password, user.passwordHash);
  if (!match) {
    return { ok: false, reason: 'invalid_credentials' };
  }

  if (user.status !== 'active') {
    return { ok: false, reason: 'disabled' };
  }

  return { ok: true, user };
}
