import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { onegoPrisma?: PrismaClient };

export const prisma =
  globalForPrisma.onegoPrisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["warn", "error"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.onegoPrisma = prisma;
}
