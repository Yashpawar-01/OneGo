import type { PrismaClient } from "@prisma/client";
import type { ProviderAdapterRegistry } from "@onego/core";

export type ServiceContext = {
  prisma: PrismaClient;
  registry: ProviderAdapterRegistry;
  encryptionKey: string;
};
