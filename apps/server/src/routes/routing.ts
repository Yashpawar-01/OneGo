import { Router } from "express";
import type { Prisma, RoutingRule } from "@prisma/client";
import { z } from "zod";
import { notFound } from "../lib/http-error.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseBody } from "../lib/validate.js";
import type { AuthedRequest } from "../middleware/auth.js";
import type { ServiceContext } from "../services/context.js";

const ruleSchema = z.object({
  name: z.string().trim().min(1).max(160),
  enabled: z.boolean().default(true),
  mode: z.enum(["manual", "automatic", "intelligent"]).default("automatic"),
  priority: z.coerce.number().int().min(0).max(10_000).default(100),
  conditions: z.record(z.unknown()).default({}),
  targetProviderKind: z
    .enum(["openai", "anthropic", "github", "qoder"])
    .nullable()
    .optional(),
  targetModelId: z.string().trim().max(200).nullable().optional(),
});

const ruleUpdateSchema = ruleSchema.partial().strict();

function ruleDto(rule: RoutingRule) {
  return {
    id: rule.id,
    name: rule.name,
    enabled: rule.enabled,
    mode: rule.mode.toLowerCase(),
    priority: rule.priority,
    conditions: rule.conditions,
    targetProviderKind: rule.targetProviderKind?.toLowerCase() ?? null,
    targetModelId: rule.targetModelId,
    createdAt: rule.createdAt.toISOString(),
    updatedAt: rule.updatedAt.toISOString(),
  };
}

export function createRoutingRouter(ctx: ServiceContext): Router {
  const router = Router();

  router.get(
    "/rules",
    asyncHandler(async (req, res) => {
      const { userId } = req as AuthedRequest;
      const rules = await ctx.prisma.routingRule.findMany({
        where: { userId },
        orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
      });
      res.json({ rules: rules.map(ruleDto) });
    }),
  );

  router.post(
    "/rules",
    asyncHandler(async (req, res) => {
      const { userId } = req as AuthedRequest;
      const body = parseBody(ruleSchema, req.body);
      const rule = await ctx.prisma.routingRule.create({
        data: {
          userId,
          name: body.name,
          enabled: body.enabled,
          mode: (body.mode ?? "automatic").toUpperCase() as
            | "MANUAL"
            | "AUTOMATIC"
            | "INTELLIGENT",
          priority: body.priority,
          conditions: body.conditions as Prisma.InputJsonValue,
          targetProviderKind: body.targetProviderKind
            ? (body.targetProviderKind.toUpperCase() as "OPENAI" | "ANTHROPIC" | "GITHUB" | "QODER")
            : null,
          targetModelId: body.targetModelId ?? null,
        },
      });
      res.status(201).json({ rule: ruleDto(rule) });
    }),
  );

  router.patch(
    "/rules/:ruleId",
    asyncHandler(async (req, res) => {
      const { userId } = req as AuthedRequest;
      const body = parseBody(ruleUpdateSchema, req.body);
      const existing = await ctx.prisma.routingRule.findFirst({
        where: { id: req.params.ruleId, userId },
        select: { id: true },
      });
      if (!existing) throw notFound("Routing rule");

      const rule = await ctx.prisma.routingRule.update({
        where: { id: existing.id },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
          ...(body.mode
            ? { mode: body.mode.toUpperCase() as "MANUAL" | "AUTOMATIC" | "INTELLIGENT" }
            : {}),
          ...(body.priority !== undefined ? { priority: body.priority } : {}),
          ...(body.conditions !== undefined
            ? { conditions: body.conditions as Prisma.InputJsonValue }
            : {}),
          ...(body.targetProviderKind !== undefined
            ? {
                targetProviderKind: body.targetProviderKind
                  ? (body.targetProviderKind.toUpperCase() as
                      | "OPENAI"
                      | "ANTHROPIC"
                      | "GITHUB"
                      | "QODER")
                  : null,
              }
            : {}),
          ...(body.targetModelId !== undefined
            ? { targetModelId: body.targetModelId }
            : {}),
        },
      });
      res.json({ rule: ruleDto(rule) });
    }),
  );

  router.delete(
    "/rules/:ruleId",
    asyncHandler(async (req, res) => {
      const { userId } = req as AuthedRequest;
      const result = await ctx.prisma.routingRule.deleteMany({
        where: { id: req.params.ruleId, userId },
      });
      if (result.count === 0) throw notFound("Routing rule");
      res.status(204).end();
    }),
  );

  return router;
}
