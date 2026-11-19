import cors from "cors";
import express, {
  type ErrorRequestHandler,
  type Express,
  type RequestHandler,
} from "express";
import pinoHttp from "pino-http";
import type { Logger } from "pino";
import { createHealthRouter } from "./routes/health.js";

export type CreateAppOptions = {
  logger?: Logger;
  allowedOrigins?: string[];
};

const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({
    error: { code: "not_found", message: "Route not found" },
  });
};

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const message =
    error instanceof Error ? error.message : "Unexpected server error";
  res.status(500).json({
    error: { code: "internal_error", message },
  });
};

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

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
