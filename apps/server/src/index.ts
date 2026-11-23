import { createServer } from "node:http";
import { createApp } from "./app.js";
import { loadEnvFiles, parseEnv } from "./config/env.js";
import { createLogger } from "./lib/logger.js";
import { prisma } from "./lib/prisma.js";
import { createAdapterRegistry, CopilotAdapter } from "./adapters/index.js";
import { seedProviderCatalog } from "./providers/catalog.js";

loadEnvFiles();
const env = parseEnv();
const logger = createLogger(env.LOG_LEVEL);

const allowedOrigins = env.CORS_ORIGIN.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const registry = createAdapterRegistry();

try {
  await seedProviderCatalog(prisma);
} catch (error) {
  logger.warn(
    { error: error instanceof Error ? error.message : error },
    "Provider catalog seed failed; check DATABASE_URL before using the API",
  );
}

const app = createApp({ logger, allowedOrigins, env, prisma, registry });
const server = createServer(app);

server.listen(env.PORT, () => {
  logger.info(
    { port: env.PORT, nodeEnv: env.NODE_ENV },
    "OneGo server listening",
  );
});

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "Shutting down");

  const forceTimer = setTimeout(() => {
    logger.error("Forced shutdown after timeout");
    process.exit(1);
  }, 10_000);
  forceTimer.unref();

  server.close(async (error) => {
    if (error) logger.error({ error }, "Error closing HTTP server");
    const copilot = registry.get("github");
    if (copilot instanceof CopilotAdapter) {
      await copilot.shutdown().catch(() => undefined);
    }
    await prisma.$disconnect().catch(() => undefined);
    clearTimeout(forceTimer);
    process.exit(error ? 1 : 0);
  });
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "Unhandled promise rejection");
});
