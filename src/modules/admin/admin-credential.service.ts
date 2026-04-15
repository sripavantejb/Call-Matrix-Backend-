import type { Env } from '../../config/env.js';
import { prisma } from '../../config/database.js';
import { generateApiKey, generateApiSecret } from '../../utils/credentialGenerator.js';
import { hashPassword } from '../../utils/hash.js';

export async function listCredentialsForAdmin(includeRevoked = false) {
  return prisma.apiCredential.findMany({
    where: includeRevoked ? {} : { revokedAt: null },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      userId: true,
      apiKey: true,
      label: true,
      revokedAt: true,
      createdAt: true,
      user: { select: { id: true, email: true, name: true, company: true } },
    },
  });
}

export async function createCredentialForUser(userId: string, env: Env) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw Object.assign(new Error('User not found'), { code: 'NOT_FOUND' });
  }

  const apiKey = generateApiKey();
  const apiSecret = generateApiSecret();
  const apiSecretHash = await hashPassword(apiSecret, env);

  const row = await prisma.apiCredential.create({
    data: {
      userId,
      apiKey,
      apiSecretHash,
      label: 'additional',
    },
  });

  return {
    id: row.id,
    api_key: apiKey,
    api_secret: apiSecret,
  };
}

export async function revokeCredentialById(
  credentialId: string,
  adminUserId: string,
): Promise<void> {
  const cred = await prisma.apiCredential.findUnique({
    where: { id: credentialId },
    include: { user: { select: { id: true } } },
  });
  if (!cred) {
    throw Object.assign(new Error('Credential not found'), { code: 'NOT_FOUND' });
  }

  const activeCount = await prisma.apiCredential.count({
    where: { userId: cred.userId, revokedAt: null },
  });
  if (activeCount <= 1) {
    throw Object.assign(
      new Error('Cannot revoke the only active credential; regenerate or add another first'),
      { code: 'LAST_CREDENTIAL' },
    );
  }

  void adminUserId;

  await prisma.apiCredential.update({
    where: { id: credentialId },
    data: { revokedAt: new Date() },
  });
}

export async function regenerateApiKeysForUser(userId: string, env: Env) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw Object.assign(new Error('User not found'), { code: 'NOT_FOUND' });
  }

  const apiKey = generateApiKey();
  const apiSecret = generateApiSecret();
  const apiSecretHash = await hashPassword(apiSecret, env);

  await prisma.$transaction(async (tx) => {
    await tx.apiCredential.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await tx.apiCredential.create({
      data: {
        userId,
        apiKey,
        apiSecretHash,
        label: 'rotated',
      },
    });
  });

  return { api_key: apiKey, api_secret: apiSecret };
}
