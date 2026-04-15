import type { Prisma, SystemLogType } from '@prisma/client';
import { prisma } from '../../config/database.js';

export async function appendSystemLog(data: {
  type: SystemLogType;
  message: string;
  metadata?: Prisma.InputJsonValue;
  userId?: string | null;
}): Promise<void> {
  await prisma.systemLog.create({
    data: {
      type: data.type,
      message: data.message,
      metadata: data.metadata === undefined ? undefined : data.metadata,
      userId: data.userId ?? undefined,
    },
  });
}

export async function listSystemLogs(params: {
  take: number;
  skip: number;
  type?: SystemLogType;
  userId?: string;
  from?: Date;
  to?: Date;
}) {
  const dateFilter =
    params.from !== undefined || params.to !== undefined
      ? {
          createdAt: {
            gte: params.from ?? new Date(0),
            lte: params.to ?? new Date(),
          },
        }
      : {};

  return prisma.systemLog.findMany({
    where: {
      ...(params.type ? { type: params.type } : {}),
      ...(params.userId ? { userId: params.userId } : {}),
      ...dateFilter,
    },
    orderBy: { createdAt: 'desc' },
    take: params.take,
    skip: params.skip,
    include: {
      user: { select: { id: true, email: true, name: true } },
    },
  });
}
