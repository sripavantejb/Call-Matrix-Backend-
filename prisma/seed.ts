import { PrismaClient, UserRole, UserStatus } from '@prisma/client';
import bcrypt from 'bcrypt';
import { config } from 'dotenv';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const envDir = dirname(fileURLToPath(import.meta.url));
config({ path: join(envDir, '..', '.env'), override: true });

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    console.info('Skipping seed: set ADMIN_EMAIL and ADMIN_PASSWORD in .env to create super admin.');
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.info('Seed skipped: admin user already exists.');
    return;
  }

  const rounds = Number(process.env.BCRYPT_ROUNDS ?? 12);
  const passwordHash = await bcrypt.hash(password, rounds);

  await prisma.user.create({
    data: {
      name: 'Super Admin',
      email,
      passwordHash,
      role: UserRole.admin,
      company: 'Call Matrix',
      plan: 'internal',
      status: UserStatus.active,
    },
  });

  console.info(`Super admin created: ${email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
