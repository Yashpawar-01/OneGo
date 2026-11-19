import { createServer } from "node:http";
import { createApp } from "./app.js";
import { loadEnvFiles, parseEnv } from "./config/env.js";
import { createLogger } from "./lib/logger.js";

loadEnvFiles();
const env = parseEnv();
const logger = createLogger(env.LOG_LEVEL);

const allowedOrigins = env.CORS_ORIGIN.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const app = createApp({ logger, allowedOrigins });
const server = createServer(app);

server.listen(env.PORT, () => {
  logger.info(
    { port: env.PORT, nodeEnv: env.NODE_ENV },
    "OneGo server listening",
  );
});

function shutdown(signal: string): void {
  logger.info({ signal }, "Shutting down");
  server.close((error) => {
    if (error) {
      logger.error({ error }, "Error during shutdown");
      process.exit(1);
    }
    process.exit(0);
  });
  setTimeout(() => {
    logger.error("Forced shutdown after timeout");
    process.exit(1);
  }, 10_000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "Unhandled promise rejection");
});
