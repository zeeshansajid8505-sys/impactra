import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var __impactra_prisma: PrismaClient | undefined;
}

export function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['warn', 'error']
        : ['error'],
  });
}

export const prisma: PrismaClient =
  global.__impactra_prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  global.__impactra_prisma = prisma;
}
