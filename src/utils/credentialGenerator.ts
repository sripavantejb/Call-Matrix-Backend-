import { randomBytes } from 'node:crypto';

/** Human-readable temporary password for new SaaS users */
export function generateReadablePassword(): string {
  return randomBytes(12).toString('base64url').slice(0, 16);
}

/** Public API key (prefix matches admin spec) */
export function generateApiKey(): string {
  return `cmx_${randomBytes(24).toString('hex')}`;
}

/** API secret shown once at creation */
export function generateApiSecret(): string {
  return `cmx_secret_${randomBytes(32).toString('base64url')}`;
}
