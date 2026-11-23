import type { Request, RequestHandler } from "express";
import { unauthorized } from "../lib/http-error.js";
import { verifyToken } from "../lib/jwt.js";

export type AuthedRequest = Request & { userId: string };

export function requireAuth(jwtSecret: string): RequestHandler {
  return (req, _res, next) => {
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
    if (!token) {
      next(unauthorized());
      return;
    }
    const userId = verifyToken(token, jwtSecret);
    if (!userId) {
      next(unauthorized("Session expired or invalid"));
      return;
    }
    (req as AuthedRequest).userId = userId;
    next();
  };
}
