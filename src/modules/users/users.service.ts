import { prisma } from '../../config/database.js';

export async function getProfile(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
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
  return user;
}

export async function updateProfileName(userId: string, name: string) {
  return prisma.user.update({
    where: { id: userId },
    data: { name: name.trim() },
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
