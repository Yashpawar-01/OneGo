import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { asyncHandler } from "../lib/async-handler.js";
import type { AuthedRequest } from "../middleware/auth.js";
import type { ServiceContext } from "../services/context.js";
import { accountDto, accountUsageSnapshot, toProviderModelInfo } from "../services/accounts.js";
import { parseBody } from "../lib/validate.js";
import { z } from "zod";
import { classifyTask, rankModelsForTask } from "@onego/core";

const rangeSchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(7),
});

type EventRow = {
  status: string;
  modelId: string | null;
  source: string;
  inputTokens: number | null;
  outputTokens: number | null;
  estimatedCostUsd: Prisma.Decimal | null;
  occurredAt: Date;
  account: {
    id: string;
    label: string;
    provider: { name: string; kind: string };
  };
};

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function costOf(value: Prisma.Decimal | null): number | null {
  return value === null ? null : Number(value.toString());
}

function startOfDaysAgo(days: number): Date {
  const since = new Date(Date.now() - days * 86_400_000);
  since.setUTCHours(0, 0, 0, 0);
  return since;
}

export function createUsageRouter(ctx: ServiceContext): Router {
  const router = Router();

  router.get(
    "/summary",
    asyncHandler(async (req, res) => {
      const { userId } = req as AuthedRequest;
      const { days } = rangeSchema.parse(req.query);
      const since = startOfDaysAgo(days);
      const comparisonSince = startOfDaysAgo(days * 2);

      const events = (await ctx.prisma.usageEvent.findMany({
        where: { account: { userId }, occurredAt: { gte: comparisonSince } },
        include: {
          account: {
            select: {
              id: true,
              label: true,
              provider: { select: { name: true, kind: true } },
            },
          },
        },
        orderBy: { occurredAt: "asc" },
        take: 20_000,
      })) as EventRow[];

      let requests = 0;
      let success = 0;
      let inputTokens = 0;
      let outputTokens = 0;
      let costSum = 0;
      let costObserved = false;
      const sources: Record<string, number> = {};

      let prevRequests = 0;
      let prevSuccess = 0;
      let prevInputTokens = 0;
      let prevOutputTokens = 0;
      let prevCostSum = 0;
      let prevCostObserved = false;

      const byDay = new Map<
        string,
        { requests: number; errors: number; inputTokens: number; outputTokens: number; costUsd: number | null }
      >();
      const byProvider = new Map<
        string,
        { name: string; requests: number; errors: number; inputTokens: number; outputTokens: number; costUsd: number | null }
      >();
      const byModel = new Map<
        string,
        { modelId: string; requests: number; inputTokens: number; outputTokens: number; costUsd: number | null }
      >();
      const byAccount = new Map<
        string,
        { accountId: string; label: string; provider: string; requests: number; errors: number; inputTokens: number; outputTokens: number; costUsd: number | null }
      >();

      for (const event of events) {
        const ok = event.status === "success";
        const input = event.inputTokens ?? 0;
        const output = event.outputTokens ?? 0;
        const cost = costOf(event.estimatedCostUsd);

        if (event.occurredAt < since) {
          prevRequests += 1;
          if (ok) prevSuccess += 1;
          prevInputTokens += input;
          prevOutputTokens += output;
          if (cost !== null) {
            prevCostSum += cost;
            prevCostObserved = true;
          }
          continue;
        }

        requests += 1;
        if (ok) success += 1;
        inputTokens += input;
        outputTokens += output;
        if (cost !== null) {
          costSum += cost;
          costObserved = true;
        }
        sources[event.source] = (sources[event.source] ?? 0) + 1;

        const day = dayKey(event.occurredAt);
        const dayEntry =
          byDay.get(day) ??
          { requests: 0, errors: 0, inputTokens: 0, outputTokens: 0, costUsd: null };
        dayEntry.requests += 1;
        if (!ok) dayEntry.errors += 1;
        dayEntry.inputTokens += input;
        dayEntry.outputTokens += output;
        if (cost !== null) dayEntry.costUsd = (dayEntry.costUsd ?? 0) + cost;
        byDay.set(day, dayEntry);

        const kind = event.account.provider.kind.toLowerCase();
        const providerEntry =
          byProvider.get(kind) ??
          {
            name: event.account.provider.name,
            requests: 0,
            errors: 0,
            inputTokens: 0,
            outputTokens: 0,
            costUsd: null,
          };
        providerEntry.requests += 1;
        if (!ok) providerEntry.errors += 1;
        providerEntry.inputTokens += input;
        providerEntry.outputTokens += output;
        if (cost !== null) providerEntry.costUsd = (providerEntry.costUsd ?? 0) + cost;
        byProvider.set(kind, providerEntry);

        const modelKey = event.modelId ?? "unknown";
        const modelEntry =
          byModel.get(modelKey) ??
          { modelId: modelKey, requests: 0, inputTokens: 0, outputTokens: 0, costUsd: null };
        modelEntry.requests += 1;
        modelEntry.inputTokens += input;
        modelEntry.outputTokens += output;
        if (cost !== null) modelEntry.costUsd = (modelEntry.costUsd ?? 0) + cost;
        byModel.set(modelKey, modelEntry);

        const accountEntry =
          byAccount.get(event.account.id) ??
          {
            accountId: event.account.id,
            label: event.account.label,
            provider: event.account.provider.name,
            requests: 0,
            errors: 0,
            inputTokens: 0,
            outputTokens: 0,
            costUsd: null,
          };
        accountEntry.requests += 1;
        if (!ok) accountEntry.errors += 1;
        accountEntry.inputTokens += input;
        accountEntry.outputTokens += output;
        if (cost !== null) accountEntry.costUsd = (accountEntry.costUsd ?? 0) + cost;
        byAccount.set(event.account.id, accountEntry);
      }

      res.json({
        range: { days, since: since.toISOString() },
        totals: {
          requests,
          success,
          errors: requests - success,
          successRate: requests === 0 ? null : success / requests,
          inputTokens,
          outputTokens,
          estimatedCostUsd: costObserved ? costSum : null,
          sources: Object.fromEntries(
            Object.entries(sources).sort(([, a], [, b]) => b - a),
          ),
        },
        previous: {
          requests: prevRequests,
          success: prevSuccess,
          errors: prevRequests - prevSuccess,
          successRate: prevRequests === 0 ? null : prevSuccess / prevRequests,
          inputTokens: prevInputTokens,
          outputTokens: prevOutputTokens,
          estimatedCostUsd: prevCostObserved ? prevCostSum : null,
        },
        byDay: [...byDay.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([day, value]) => ({ day, ...value })),
        byProvider: [...byProvider.entries()].map(([kind, value]) => ({
          providerKind: kind,
          ...value,
        })),
        byModel: [...byModel.values()].sort((a, b) => b.requests - a.requests),
        byAccount: [...byAccount.values()].sort((a, b) => b.requests - a.requests),
        notes: [
          "Token counts are recorded only when a provider reports usage through an official channel.",
          "Cost figures are estimates derived from synced list prices; they are null when pricing is unknown.",
          "Quota and rate-limit values are shown only for providers that expose them officially.",
        ],
      });
    }),
  );

  router.get(
    "/accounts",
    asyncHandler(async (req, res) => {
      const { userId } = req as AuthedRequest;
      const since = startOfDaysAgo(7);

      const accounts = await ctx.prisma.providerAccount.findMany({
        where: { userId },
        include: { provider: { include: { models: true } } },
        orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
      });

      const grouped = await ctx.prisma.usageEvent.groupBy({
        by: ["providerAccountId"],
        where: { account: { userId }, occurredAt: { gte: since } },
        _count: { _all: true },
        _sum: { inputTokens: true, outputTokens: true, estimatedCostUsd: true },
      });
      const usageByAccount = new Map(
        grouped.map((row) => [row.providerAccountId, row]),
      );

      const snapshots = await Promise.all(
        accounts.map(async (account) => {
          const snapshot = await accountUsageSnapshot(ctx, account, false);
          const rollup = usageByAccount.get(account.id);
          return {
            account: accountDto(account),
            usage: snapshot,
            last7Days: {
              requests: rollup?._count._all ?? 0,
              inputTokens: rollup?._sum.inputTokens ?? 0,
              outputTokens: rollup?._sum.outputTokens ?? 0,
              estimatedCostUsd:
                rollup?._sum.estimatedCostUsd === null ||
                rollup?._sum.estimatedCostUsd === undefined
                  ? null
                  : Number(rollup._sum.estimatedCostUsd.toString()),
            },
          };
        }),
      );

      res.json({ accounts: snapshots });
    }),
  );

  router.get(
    "/catalog",
    asyncHandler(async (_req, res) => {
      const providers = await ctx.prisma.provider.findMany({
        include: {
          models: { where: { available: true }, orderBy: { displayName: "asc" } },
        },
        orderBy: { name: "asc" },
      });
      res.json({
        models: providers.flatMap((provider) =>
          provider.models.map((model) => ({
            providerKind: provider.kind.toLowerCase(),
            providerName: provider.name,
            ...toProviderModelInfo(model),
          })),
        ),
      });
    }),
  );

  const previewSchema = z.object({
    prompt: z.string().trim().min(1).max(20_000),
  });

  router.post(
    "/preview",
    asyncHandler(async (req, res) => {
      const body = parseBody(previewSchema, req.body);
      const classification = classifyTask(body.prompt);
      const providers = await ctx.prisma.provider.findMany({
        include: { models: { where: { available: true } } },
      });
      const candidates = providers.flatMap((provider) =>
        provider.models.map((model) => ({
          providerKind: provider.kind.toLowerCase(),
          providerName: provider.name,
          info: toProviderModelInfo(model),
        })),
      );
      const ranked = rankModelsForTask(
        candidates.map((candidate) => candidate.info),
        classification,
      );
      const byInfo = new Map(candidates.map((candidate) => [candidate.info, candidate]));

      res.json({
        classification,
        recommendations: ranked.slice(0, 8).map((scored) => {
          const candidate = byInfo.get(scored.model);
          return {
            providerKind: candidate?.providerKind ?? null,
            providerName: candidate?.providerName ?? null,
            modelId: scored.model.id,
            displayName: scored.model.displayName,
            score: Math.round(scored.score * 10) / 10,
            reasons: scored.reasons,
          };
        }),
      });
    }),
  );

  return router;
}
