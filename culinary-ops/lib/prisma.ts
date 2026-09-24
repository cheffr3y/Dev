import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

// Next's production server can evaluate the Prisma module through more than one
// server chunk. Keep one client on the process global in every environment so
// each chunk does not open its own PostgreSQL connection pool.
globalForPrisma.prisma = prisma;
