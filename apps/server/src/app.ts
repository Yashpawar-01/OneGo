import cors from "cors";
import express, {
  type ErrorRequestHandler,
  type Express,
  type RequestHandler,
} from "express";
import pinoHttp from "pino-http";
import type { Logger } from "pino";
import type { PrismaClient } from "@prisma/client";
import type { ProviderAdapterRegistry } from "@onego/core";
import { createHealthRouter } from "./routes/health.js";
import { createAuthRouter } from "./routes/auth.js";
import { createProvidersRouter } from "./routes/providers.js";
import { createConversationsRouter } from "./routes/conversations.js";
import { createProjectsRouter } from "./routes/projects.js";
import { createUsageRouter } from "./routes/usage.js";
import { createOverviewRouter } from "./routes/overview.js";
import { createRoutingRouter } from "./routes/routing.js";
import { requireAuth } from "./middleware/auth.js";
import { createAdapterRegistry } from "./adapters/index.js";
import { prisma as defaultPrisma } from "./lib/prisma.js";
import { HttpError } from "./lib/http-error.js";
import type { Env } from "./config/env.js";
import type { ServiceContext } from "./services/context.js";

export type CreateAppOptions = {
  logger?: Logger;
  allowedOrigins?: string[];
  /** When present, the full authenticated API is mounted. */
  env?: Env;
  prisma?: PrismaClient;
  registry?: ProviderAdapterRegistry;
};

const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({
    error: { code: "not_found", message: "Route not found" },
  });
};

function createErrorHandler(nodeEnv: string): ErrorRequestHandler {
  return (error, _req, res, _next) => {
    if (res.headersSent) {
      res.end();
      return;
    }
    if (error instanceof HttpError) {
      res.status(error.status).json({
        error: { code: error.code, message: error.message },
      });
      return;
    }
    const isProduction = nodeEnv === "production";
    const message =
      !isProduction && error instanceof Error
        ? error.message
        : "Unexpected server error";
    res.status(500).json({
      error: { code: "internal_error", message },
    });
  };
}

export function createApp(options: CreateAppOptions = {}): Express {
  const app = express();
  app.disable("x-powered-by");

  if (options.allowedOrigins?.length) {
    app.use(cors({ origin: options.allowedOrigins, credentials: true }));
  }

  app.use(express.json({ limit: "2mb" }));

  if (options.logger) {
    app.use(pinoHttp({ logger: options.logger }));
  }

  app.use("/api/health", createHealthRouter());

  if (options.env) {
    const prisma = options.prisma ?? defaultPrisma;
    const registry = options.registry ?? createAdapterRegistry();
    const ctx: ServiceContext = {
      prisma,
      registry,
      encryptionKey: options.env.CREDENTIAL_ENCRYPTION_KEY,
    };
    const auth = requireAuth(options.env.JWT_SECRET);

    app.use("/api/auth", createAuthRouter(ctx, options.env.JWT_SECRET));
    app.use("/api/providers", auth, createProvidersRouter(ctx));
    app.use("/api/conversations", auth, createConversationsRouter(ctx));
    app.use("/api", auth, createProjectsRouter(ctx));
    app.use("/api/usage", auth, createUsageRouter(ctx));
    app.use("/api/overview", auth, createOverviewRouter(ctx));
    app.use("/api/routing", auth, createRoutingRouter(ctx));
  }

  app.use(notFoundHandler);
  app.use(createErrorHandler(options.env?.NODE_ENV ?? "development"));

  return app;
}
