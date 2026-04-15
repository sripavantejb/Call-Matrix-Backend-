import bcrypt from 'bcrypt';
import type { Env } from '../config/env.js';

export async function hashPassword(plain: string, env: Env): Promise<string> {
  return bcrypt.hash(plain, env.BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
