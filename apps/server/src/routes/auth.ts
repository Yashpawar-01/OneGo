import { Router } from "express";
import { z } from "zod";
import { HttpError, badRequest, unauthorized } from "../lib/http-error.js";
import { asyncHandler } from "../lib/async-handler.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { signToken } from "../lib/jwt.js";
import { parseBody } from "../lib/validate.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import type { ServiceContext } from "../services/context.js";

const registerSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
  name: z.string().trim().max(120).optional(),
});

const loginSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(1).max(200),
});

type ThrottleEntry = { count: number; resetAt: number };
const LOGIN_WINDOW_MS = 15 * 60_000;
const LOGIN_MAX_FAILURES = 10;
const loginFailures = new Map<string, ThrottleEntry>();

function checkThrottle(key: string): void {
  const entry = loginFailures.get(key);
  if (!entry) return;
  if (entry.resetAt <= Date.now()) {
    loginFailures.delete(key);
    return;
  }
  if (entry.count >= LOGIN_MAX_FAILURES) {
    throw new HttpError(
      429,
      "too_many_attempts",
      "Too many failed sign-in attempts. Try again later.",
    );
  }
}

function recordFailure(key: string): void {
  const now = Date.now();
  const entry = loginFailures.get(key);
  if (!entry || entry.resetAt <= now) {
    loginFailures.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return;
  }
  entry.count += 1;
}

function userDto(user: {
  id: string;
  email: string;
  name: string | null;
  role: string;
  createdAt: Date;
}) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role.toLowerCase(),
    createdAt: user.createdAt.toISOString(),
  };
}

export function createAuthRouter(ctx: ServiceContext, jwtSecret: string): Router {
  const router = Router();

  router.post(
    "/register",
    asyncHandler(async (req, res) => {
      const body = parseBody(registerSchema, req.body);
      const email = body.email.toLowerCase();
      const existing = await ctx.prisma.user.findUnique({ where: { email } });
      if (existing) {
        throw new HttpError(
          409,
          "email_taken",
          "An account with this email already exists",
        );
      }
      const userCount = await ctx.prisma.user.count();
      const user = await ctx.prisma.user.create({
        data: {
          email,
          name: body.name ?? null,
          passwordHash: hashPassword(body.password),
          role: userCount === 0 ? "OWNER" : "MEMBER",
        },
      });
      await ctx.prisma.auditLog.create({
        data: { userId: user.id, action: "auth.register", entityType: "user" },
      });
      res.status(201).json({
        user: userDto(user),
        token: signToken(user.id, jwtSecret),
      });
    }),
  );

  router.post(
    "/login",
    asyncHandler(async (req, res) => {
      const body = parseBody(loginSchema, req.body);
      const email = body.email.toLowerCase();
      const throttleKey = `${req.ip ?? "unknown"}:${email}`;
      checkThrottle(throttleKey);

      const user = await ctx.prisma.user.findUnique({ where: { email } });
      if (!user || !verifyPassword(body.password, user.passwordHash)) {
        recordFailure(throttleKey);
        throw unauthorized("Invalid email or password");
      }
      loginFailures.delete(throttleKey);
      res.json({
        user: userDto(user),
        token: signToken(user.id, jwtSecret),
      });
    }),
  );

  router.get(
    "/me",
    requireAuth(jwtSecret),
    asyncHandler(async (req, res) => {
      const { userId } = req as AuthedRequest;
      const user = await ctx.prisma.user.findUnique({ where: { id: userId } });
      if (!user) throw badRequest("User no longer exists");
      res.json({ user: userDto(user) });
    }),
  );

  return router;
}
