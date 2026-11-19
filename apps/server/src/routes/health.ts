import { Router } from "express";

export function createHealthRouter(): Router {
  const startedAt = Date.now();
  const router = Router();

  router.get("/", (_req, res) => {
    res.json({
      status: "ok",
      service: "onego-server",
      version: "0.1.0",
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      timestamp: new Date().toISOString(),
    });
  });

  return router;
}
