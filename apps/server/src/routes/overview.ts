import { Router } from "express";
import { asyncHandler } from "../lib/async-handler.js";
import type { AuthedRequest } from "../middleware/auth.js";
import type { ServiceContext } from "../services/context.js";
import { listCooldowns } from "../services/cooldowns.js";

function sevenDaysAgo(): Date {
  const since = new Date(Date.now() - 7 * 86_400_000);
  since.setUTCHours(0, 0, 0, 0);
  return since;
}

export function createOverviewRouter(ctx: ServiceContext): Router {
  const router = Router();

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const { userId } = req as AuthedRequest;
      const since = sevenDaysAgo();

      const [
        accounts,
        accountStatuses,
        conversationCount,
        projectCount,
        messageCount,
        switchCount,
        usageAggregate,
        recentConversations,
        recentSwitches,
        syncedModelCount,
      ] = await Promise.all([
        ctx.prisma.providerAccount.findMany({
          where: { userId },
          include: { provider: true },
          orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
        }),
        ctx.prisma.providerAccount.groupBy({
          by: ["status"],
          where: { userId },
          _count: { _all: true },
        }),
        ctx.prisma.conversation.count({ where: { userId } }),
        ctx.prisma.project.count({ where: { userId } }),
        ctx.prisma.message.count({ where: { conversation: { userId } } }),
        ctx.prisma.providerSwitch.count({ where: { conversation: { userId } } }),
        ctx.prisma.usageEvent.aggregate({
          where: { account: { userId }, occurredAt: { gte: since } },
          _count: { _all: true },
          _sum: {
            inputTokens: true,
            outputTokens: true,
            estimatedCostUsd: true,
          },
        }),
        ctx.prisma.conversation.findMany({
          where: { userId, status: "ACTIVE" },
          orderBy: { updatedAt: "desc" },
          take: 5,
          include: { project: { select: { name: true } } },
        }),
        ctx.prisma.providerSwitch.findMany({
          where: { conversation: { userId } },
          orderBy: { createdAt: "desc" },
          take: 5,
          include: {
            fromAccount: { select: { label: true, provider: { select: { name: true } } } },
            toAccount: { select: { label: true, provider: { select: { name: true } } } },
            conversation: { select: { id: true, title: true } },
          },
        }),
        ctx.prisma.providerModel.count({
          where: { available: true, provider: { accounts: { some: { userId } } } },
        }),
      ]);

      const statusCounts = Object.fromEntries(
        accountStatuses.map((row) => [row.status.toLowerCase(), row._count._all]),
      );
      const cooldowns = listCooldowns();

      res.json({
        counts: {
          accounts: accounts.length,
          connectedAccounts: statusCounts.connected ?? 0,
          errorAccounts: statusCounts.error ?? 0,
          expiredAccounts: statusCounts.expired ?? 0,
          disabledAccounts: statusCounts.disabled ?? 0,
          conversations: conversationCount,
          projects: projectCount,
          messages: messageCount,
          providerSwitches: switchCount,
        },
        usage7d: {
          requests: usageAggregate._count._all,
          inputTokens: usageAggregate._sum.inputTokens ?? 0,
          outputTokens: usageAggregate._sum.outputTokens ?? 0,
          estimatedCostUsd:
            usageAggregate._sum.estimatedCostUsd === null
              ? null
              : Number(usageAggregate._sum.estimatedCostUsd.toString()),
        },
        providers: accounts.map((account) => ({
          accountId: account.id,
          providerKind: account.provider.kind.toLowerCase(),
          providerName: account.provider.name,
          label: account.label,
          status: account.status.toLowerCase(),
          statusMessage: account.statusMessage,
          enabled: account.enabled,
          priority: account.priority,
          lastUsedAt: account.lastUsedAt?.toISOString() ?? null,
          coolingDownUntil:
            cooldowns.find((cooldown) => cooldown.accountId === account.id)?.until ??
            null,
        })),
        recentConversations: recentConversations.map((conversation) => ({
          id: conversation.id,
          title: conversation.title,
          projectName: conversation.project?.name ?? null,
          updatedAt: conversation.updatedAt.toISOString(),
          lastMessageAt: conversation.lastMessageAt?.toISOString() ?? null,
        })),
        recentSwitches: recentSwitches.map((row) => ({
          id: row.id,
          conversationId: row.conversation.id,
          conversationTitle: row.conversation.title,
          reason: row.reason.toLowerCase(),
          detail: row.detail,
          from: row.fromAccount
            ? `${row.fromAccount.provider.name} · ${row.fromAccount.label}`
            : "unknown",
          to: row.toAccount
            ? `${row.toAccount.provider.name} · ${row.toAccount.label}`
            : "unknown",
          createdAt: row.createdAt.toISOString(),
        })),
        onboarding: {
          hasProviderAccounts: accounts.length > 0,
          hasSyncedModels: syncedModelCount > 0,
          hasConversations: conversationCount > 0,
        },
      });
    }),
  );

  return router;
}
