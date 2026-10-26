import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { __prisma?: PrismaClient };

// Singleton compartido entre el server custom (Socket.io) y los route handlers de Next.
export const prisma =
  globalForPrisma.__prisma ??
  new PrismaClient({ log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"] });

globalForPrisma.__prisma = prisma;
