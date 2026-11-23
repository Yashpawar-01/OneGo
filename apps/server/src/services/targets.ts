import { randomUUID } from "node:crypto";
import type { Conversation, ProviderModel } from "@prisma/client";
import {
  classifyTask,
  rankModelsForTask,
  selectRoutingRule,
  type AttemptTarget,
} from "@onego/core";
import type {
  ProviderModelInfo,
  RoutingMode,
  TaskClassification,
} from "@onego/shared";
import { badRequest } from "../lib/http-error.js";
import type { ServiceContext } from "./context.js";
import { activeCooldown } from "./cooldowns.js";
import { decryptCredentials } from "./credentials.js";
import { toSharedKind } from "../providers/catalog.js";
import {
  toProviderModelInfo,
  type AccountWithProvider,
} from "./accounts.js";

export type TargetSelection = {
  accountId?: string | null;
  modelId?: string | null;
  mode?: RoutingMode | null;
  /** Last user message, used by intelligent routing. */
  prompt?: string;
};

export type ResolvedTargets = {
  targets: AttemptTarget[];
  routingMode: RoutingMode;
  classification?: TaskClassification;
  /** Rule that steered this turn, when one matched and produced usable targets. */
  routingRule?: { id: string; name: string };
  /** Token budget for the context package. */
  maxTokens: number;
};

type Pair = {
  account: AccountWithProvider;
  model: ProviderModel;
};

function normalizeMode(value: string | null | undefined): RoutingMode {
  const lower = value?.toLowerCase();
  if (lower === "manual" || lower === "automatic" || lower === "intelligent") {
    return lower;
  }
  return "manual";
}

function metadataOf(account: AccountWithProvider): Record<string, unknown> {
  return (account.metadata ?? {}) as Record<string, unknown>;
}

function compareCheap(a: ProviderModel, b: ProviderModel): number {
  const costA =
    a.inputCostPerMTok === null ? Number.POSITIVE_INFINITY : Number(a.inputCostPerMTok.toString());
  const costB =
    b.inputCostPerMTok === null ? Number.POSITIVE_INFINITY : Number(b.inputCostPerMTok.toString());
  if (costA !== costB) return costA - costB;
  return a.displayName.localeCompare(b.displayName);
}

function chooseModel(
  account: AccountWithProvider,
  requestedModel?: string | null,
): ProviderModel | undefined {
  const models = account.provider.models;
  if (models.length === 0) return undefined;

  if (requestedModel) {
    const exact = models.find((model) => model.modelId === requestedModel);
    if (exact) return exact;
  }
  const preferred = metadataOf(account).defaultModel;
  if (typeof preferred === "string") {
    const match = models.find((model) => model.modelId === preferred);
    if (match) return match;
  }
  return [...models].sort(compareCheap)[0];
}

function buildInvocations(
  ctx: ServiceContext,
  pairs: Pair[],
): AttemptTarget[] {
  const targets: AttemptTarget[] = [];
  for (const pair of pairs) {
    const kind = toSharedKind(pair.account.provider.kind);
    const adapter = ctx.registry.get(kind);
    if (!adapter) continue;
    try {
      targets.push({
        accountId: pair.account.id,
        label: `${pair.account.provider.name} · ${pair.account.label}`,
        providerKind: kind,
        modelId: pair.model.modelId,
        adapter,
        invocation: {
          requestId: randomUUID(),
          accountId: pair.account.id,
          credentials: decryptCredentials(
            pair.account.credentialCiphertext,
            ctx.encryptionKey,
          ),
        },
      });
    } catch {
      // A corrupted or undecryptable credential is skipped; other accounts
      // still serve the request and the UI will surface the account error.
    }
  }
  return targets;
}

function coolingLast(pairs: Pair[]): Pair[] {
  const available: Pair[] = [];
  const cooling: Pair[] = [];
  for (const pair of pairs) {
    if (activeCooldown(pair.account.id)) cooling.push(pair);
    else available.push(pair);
  }
  return [...available, ...cooling];
}

/**
 * Resolves ordered provider targets for a conversation. Later targets are
 * fallback destinations: they receive the same context with their own model.
 */
export async function resolveTargets(
  ctx: ServiceContext,
  userId: string,
  conversation: Conversation,
  selection: TargetSelection,
): Promise<ResolvedTargets> {
  const accounts = await ctx.prisma.providerAccount.findMany({
    where: { userId, enabled: true },
    include: {
      provider: { include: { models: { where: { available: true } } } },
    },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
  });

  const eligible = accounts.filter((account) =>
    ctx.registry.has(toSharedKind(account.provider.kind)),
  );

  if (eligible.length === 0) {
    throw badRequest(
      "Connect a provider account before sending a message. Open Providers to add one.",
    );
  }

  const routingMode = normalizeMode(selection.mode ?? conversation.routingMode);
  let classification: TaskClassification | undefined;
  let appliedRule: ResolvedTargets["routingRule"];

  // Explicit per-request account/model picks always win over stored rules.
  const explicitSelection = Boolean(selection.accountId || selection.modelId);
  let effectiveMode = routingMode;
  let candidateAccounts = eligible;
  let requestedModelId = selection.modelId ?? null;

  if (!explicitSelection) {
    const storedRules = await ctx.prisma.routingRule.findMany({
      where: { userId, enabled: true },
      orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    });
    if (storedRules.length > 0) {
      classification = classifyTask(selection.prompt ?? "");
      const messageCount = await ctx.prisma.message.count({
        where: { conversationId: conversation.id },
      });
      const matched = selectRoutingRule(storedRules, {
        prompt: selection.prompt ?? "",
        taskType: classification.type,
        projectId: conversation.projectId,
        messageCount,
      });
      if (matched) {
        const targetKind = matched.targetProviderKind
          ? toSharedKind(matched.targetProviderKind)
          : null;
        let scoped = targetKind
          ? eligible.filter(
              (account) => toSharedKind(account.provider.kind) === targetKind,
            )
          : eligible;
        if (matched.targetModelId) {
          scoped = scoped.filter((account) =>
            account.provider.models.some(
              (model) => model.modelId === matched.targetModelId,
            ),
          );
        }
        // A stale rule (provider disconnected or model removed) is skipped so
        // the conversation keeps working with normal routing.
        if (scoped.length > 0) {
          effectiveMode = normalizeMode(matched.mode);
          candidateAccounts = scoped;
          requestedModelId = matched.targetModelId ?? requestedModelId;
          appliedRule = { id: matched.id, name: matched.name };
        }
      }
    }
  }

  let pairs: Pair[] = [];

  if (effectiveMode === "intelligent" && selection.prompt) {
    if (!classification) classification = classifyTask(selection.prompt);
    const candidates: Array<{ pair: Pair; info: ProviderModelInfo }> = [];
    for (const account of candidateAccounts) {
      for (const model of account.provider.models) {
        candidates.push({
          pair: { account, model },
          info: toProviderModelInfo(model),
        });
      }
    }
    const ranked = rankModelsForTask(
      candidates.map((candidate) => candidate.info),
      classification,
    );
    const byInfo = new Map(candidates.map((candidate) => [candidate.info, candidate.pair]));
    pairs = ranked
      .map((scored) => byInfo.get(scored.model))
      .filter((pair): pair is Pair => Boolean(pair));
  } else {
    let ordered = [...candidateAccounts];
    if (effectiveMode === "manual") {
      const primaryId = selection.accountId ?? conversation.activeAccountId;
      if (primaryId) {
        ordered.sort((a, b) => {
          if (a.id === primaryId) return -1;
          if (b.id === primaryId) return 1;
          return 0;
        });
      }
    }
    pairs = ordered
      .map((account) => {
        const model = chooseModel(account, requestedModelId);
        return model ? { account, model } : undefined;
      })
      .filter((pair): pair is Pair => Boolean(pair));
  }

  pairs = coolingLast(pairs);

  if (pairs.length === 0) {
    throw badRequest(
      "No synced models are available. Open Providers, validate an account, and sync its models before chatting.",
    );
  }

  const targets = buildInvocations(ctx, pairs);
  if (targets.length === 0) {
    throw badRequest(
      "No usable provider credentials were found. Reconnect an account in Providers.",
    );
  }

  const contextWindow = pairs[0]?.model.contextWindow ?? undefined;
  const maxTokens = contextWindow
    ? Math.min(48_000, Math.max(4_000, Math.floor(contextWindow * 0.6)))
    : 16_000;

  return {
    targets,
    routingMode: effectiveMode,
    classification,
    routingRule: appliedRule,
    maxTokens,
  };
}
