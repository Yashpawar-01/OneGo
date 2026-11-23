import type { Prisma } from "@prisma/client";
import {
  buildContextPackage,
  FallbackRunner,
  type AttemptTarget,
  type FallbackReason,
} from "@onego/core";
import type {
  ChatMessage,
  ProviderErrorInfo,
  TokenUsage,
} from "@onego/shared";
import { badRequest, notFound } from "../lib/http-error.js";
import type { ServiceContext } from "./context.js";
import { clearCooldown, markCooldown } from "./cooldowns.js";
import { appendMessage, nextContextVersion } from "./messages.js";
import { searchRepositoryChunks } from "./repository-index.js";
import { resolveTargets, type ResolvedTargets } from "./targets.js";

export type ChatTurnInput = {
  userId: string;
  conversationId: string;
  content: string;
  accountId?: string | null;
  modelId?: string | null;
  routingMode?: string | null;
  signal?: AbortSignal;
};

type ContextMeta = {
  includedMessages: number;
  omittedMessages: number;
  tokenEstimate: number;
  maxTokens: number;
  repositoryHits: number;
};

export type ChatStreamEvent =
  | { type: "user_message"; id: string; sequence: number; createdAt: string }
  | {
      type: "meta";
      conversationId: string;
      routingMode: string;
      classification?: ResolvedTargets["classification"];
      routingRule?: ResolvedTargets["routingRule"];
      context: ContextMeta;
    }
  | {
      type: "attempt_started";
      attempt: number;
      accountId: string;
      providerKind: string;
      modelId: string;
      label?: string;
    }
  | { type: "delta"; delta: string }
  | { type: "usage"; usage: TokenUsage }
  | {
      type: "fallback";
      reason: FallbackReason;
      fromAccountId: string;
      toAccountId: string;
      message: string;
    }
  | {
      type: "done";
      messageId: string;
      accountId: string;
      providerKind: string;
      modelId: string;
      usage?: TokenUsage;
      attempts: number;
      context: ContextMeta;
    }
  | {
      type: "error";
      error: ProviderErrorInfo;
      partial: boolean;
      text?: string;
    };

function jsonSafe(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function toChatMessages(
  messages: Array<{ role: string; content: string }>,
): ChatMessage[] {
  return messages.map((message) => ({
    role: message.role.toLowerCase() as ChatMessage["role"],
    content: message.content,
  }));
}

function switchReason(reason: FallbackReason):
  | "QUOTA_EXHAUSTED"
  | "RATE_LIMITED"
  | "AUTH_ERROR"
  | "PROVIDER_ERROR" {
  switch (reason) {
    case "quota_exhausted":
      return "QUOTA_EXHAUSTED";
    case "rate_limited":
      return "RATE_LIMITED";
    case "auth_error":
      return "AUTH_ERROR";
    default:
      return "PROVIDER_ERROR";
  }
}

function cooldownFor(kind: string): number {
  switch (kind) {
    case "quota_exhausted":
      return 6 * 60 * 60_000;
    case "rate_limited":
      return 2 * 60_000;
    case "auth":
    case "permission":
      return 10 * 60_000;
    default:
      return 0;
  }
}

function startOfUtcDay(now = new Date()): Date {
  const date = new Date(now);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

async function estimateCost(
  ctx: ServiceContext,
  providerId: string,
  modelId: string,
  usage: TokenUsage | undefined,
): Promise<number | null> {
  if (!usage) return null;
  const model = await ctx.prisma.providerModel.findUnique({
    where: { providerId_modelId: { providerId, modelId } },
  });
  if (!model) return null;
  const inputCost = model.inputCostPerMTok ? Number(model.inputCostPerMTok.toString()) : null;
  const outputCost = model.outputCostPerMTok
    ? Number(model.outputCostPerMTok.toString())
    : null;
  if (inputCost === null && outputCost === null) return null;
  return (
    ((usage.inputTokens ?? 0) / 1_000_000) * (inputCost ?? 0) +
    ((usage.outputTokens ?? 0) / 1_000_000) * (outputCost ?? 0)
  );
}

/**
 * Executes one conversation turn with automatic cross-provider fallback and
 * persists the user message, assistant reply, switches, usage and a context
 * snapshot. Yields transport-agnostic events for the SSE route.
 */
export async function* runChatTurn(
  ctx: ServiceContext,
  input: ChatTurnInput,
): AsyncIterable<ChatStreamEvent> {
  const content = input.content.trim();
  if (!content) throw badRequest("Message content is required");

  const conversation = await ctx.prisma.conversation.findFirst({
    where: { id: input.conversationId, userId: input.userId },
    include: { project: true },
  });
  if (!conversation) throw notFound("Conversation");

  const userMessage = await appendMessage(ctx.prisma, {
    conversationId: conversation.id,
    role: "USER",
    content,
    metadata: jsonSafe({
      routingMode: input.routingMode ?? conversation.routingMode,
    }),
  });
  await ctx.prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: new Date() },
  });
  await ctx.prisma.conversationEvent.create({
    data: {
      conversationId: conversation.id,
      type: "user_message",
      payload: jsonSafe({ messageId: userMessage.id, content }),
      actor: "user",
    },
  });

  yield {
    type: "user_message",
    id: userMessage.id,
    sequence: userMessage.sequence,
    createdAt: userMessage.createdAt.toISOString(),
  };

  const history = await ctx.prisma.message.findMany({
    where: { conversationId: conversation.id, role: { not: "SYSTEM" } },
    orderBy: { sequence: "desc" },
    take: 200,
  });
  history.reverse();

  const projectContext = conversation.projectId
    ? await Promise.all([
        ctx.prisma.projectMemory.findMany({
          where: { projectId: conversation.projectId },
          orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
          take: 40,
        }),
        ctx.prisma.taskState.findMany({
          where: { projectId: conversation.projectId },
          orderBy: { updatedAt: "desc" },
          take: 60,
        }),
        ctx.prisma.fileChangeLog.findMany({
          where: { projectId: conversation.projectId },
          orderBy: { createdAt: "desc" },
          take: 40,
        }),
      ])
    : undefined;

  const resolved = await resolveTargets(ctx, input.userId, conversation, {
    accountId: input.accountId,
    modelId: input.modelId,
    mode: (input.routingMode as ResolvedTargets["routingMode"] | null) ?? null,
    prompt: content,
  });

  // Code snippets share the context budget: cap them at ~20% of the window.
  const repositoryBudgetChars = Math.min(
    8_000,
    Math.max(1_500, Math.floor(resolved.maxTokens * 0.2 * 4)),
  );
  const repositoryHits = conversation.projectId
    ? await searchRepositoryChunks(ctx, conversation.projectId, content, 8)
    : [];
  const repositoryContext: Array<{
    path: string;
    startLine: number;
    endLine: number;
    content: string;
  }> = [];
  let repositoryChars = 0;
  for (const hit of repositoryHits) {
    if (repositoryChars + hit.content.length > repositoryBudgetChars) break;
    repositoryContext.push({
      path: hit.path,
      startLine: hit.startLine,
      endLine: hit.endLine,
      content: hit.content,
    });
    repositoryChars += hit.content.length;
  }

  const context = buildContextPackage({
    messages: toChatMessages(history),
    repositoryContext,
    projectMemory: projectContext?.[0].map((entry) => ({
      key: entry.key,
      value: entry.value,
      pinned: entry.pinned,
    })),
    completedTasks: projectContext?.[1]
      .filter((task) => task.status === "COMPLETED")
      .map((task) => task.title),
    pendingTasks: projectContext?.[1]
      .filter((task) => task.status !== "COMPLETED" && task.status !== "CANCELLED")
      .map((task) => `${task.title} (${task.status.toLowerCase()})`),
    fileChanges: projectContext?.[2].map((change) => ({
      path: change.path,
      changeType: change.changeType.toLowerCase(),
    })),
    maxTokens: resolved.maxTokens,
    minRecentMessages: 4,
  });

  const contextMeta: ContextMeta = {
    includedMessages: context.includedMessages,
    omittedMessages: context.omittedMessages,
    tokenEstimate: context.tokenEstimate,
    maxTokens: resolved.maxTokens,
    repositoryHits: repositoryContext.length,
  };

  yield {
    type: "meta",
    conversationId: conversation.id,
    routingMode: resolved.routingMode,
    classification: resolved.classification,
    routingRule: resolved.routingRule,
    context: contextMeta,
  };

  const abort = new AbortController();
  const onAbort = () => abort.abort();
  input.signal?.addEventListener("abort", onAbort, { once: true });

  const request = {
    model: resolved.targets[0]?.modelId ?? "default",
    messages: context.messages,
    system: context.system,
  };

  let assistantText = "";
  let usage: TokenUsage | undefined;
  let fallbackUsed = false;

  const runner = new FallbackRunner();
  type DoneData = {
    resultText: string;
    accountId: string;
    providerKind: string;
    modelId: string;
    attempts: number;
    usage?: TokenUsage;
    latencyMs?: number;
  };
  let doneData: DoneData | undefined;
  let failed: { error: ProviderErrorInfo; preservePartial: boolean } | undefined;

  const persistError = (
    target: AttemptTarget,
    errorInfo: ProviderErrorInfo,
  ): void => {
    void ctx.prisma.usageEvent
      .create({
        data: {
          providerAccountId: target.accountId,
          conversationId: conversation.id,
          modelId: target.modelId,
          status: `error_${errorInfo.kind}`,
          source: "UNAVAILABLE",
        },
      })
      .catch(() => undefined);
    void ctx.prisma.conversationEvent
      .create({
        data: {
          conversationId: conversation.id,
          type: "provider_error",
          payload: jsonSafe({
            accountId: target.accountId,
            providerKind: target.providerKind,
            modelId: target.modelId,
            error: errorInfo,
          }),
          actor: "system",
        },
      })
      .catch(() => undefined);
  };

  try {
    for await (const event of runner.stream(request, resolved.targets, {
      signal: abort.signal,
      onTargetError: (target, error) => {
        const duration = cooldownFor(error.kind);
        if (duration > 0) {
          markCooldown(
            target.accountId,
            error.kind === "quota_exhausted"
              ? "quota_exhausted"
              : error.kind === "rate_limited"
                ? "rate_limited"
                : "auth_error",
            error.kind === "rate_limited"
              ? Math.max(error.retryAfterMs ?? 60_000, duration)
              : duration,
            error.message,
          );
        }
        persistError(target, error.toInfo());
        if (error.kind === "auth" || error.kind === "permission") {
          void ctx.prisma.providerAccount
            .update({
              where: { id: target.accountId },
              data: { status: "ERROR", statusMessage: error.message },
            })
            .catch(() => undefined);
        }
      },
      onTargetSuccess: (target) => {
        void ctx.prisma.providerAccount
          .update({
            where: { id: target.accountId },
            data: { lastUsedAt: new Date() },
          })
          .catch(() => undefined);
      },
    })) {
      switch (event.type) {
        case "attempt_started": {
          const target = resolved.targets.find(
            (candidate) => candidate.accountId === event.accountId,
          );
          yield {
            type: "attempt_started",
            attempt: event.attempt,
            accountId: event.accountId,
            providerKind: event.providerKind,
            modelId: event.modelId,
            label: target?.label,
          };
          break;
        }
        case "text_delta":
          assistantText += event.delta;
          yield { type: "delta", delta: event.delta };
          break;
        case "usage":
          usage = { ...usage, ...event.usage };
          yield { type: "usage", usage: event.usage };
          break;
        case "tool_call":
          // This build exposes a chat surface; tool calls are not executed.
          break;
        case "fallback": {
          fallbackUsed = true;
          await ctx.prisma.providerSwitch.create({
            data: {
              conversationId: conversation.id,
              fromAccountId: event.fromAccountId,
              toAccountId: event.toAccountId,
              reason: switchReason(event.reason),
              detail: event.message,
            },
          });
          await ctx.prisma.conversation.update({
            where: { id: conversation.id },
            data: {
              activeAccountId: event.toAccountId,
              version: { increment: 1 },
            },
          });
          await ctx.prisma.conversationEvent.create({
            data: {
              conversationId: conversation.id,
              type: "provider_switch",
              payload: jsonSafe({
                fromAccountId: event.fromAccountId,
                toAccountId: event.toAccountId,
                reason: event.reason,
                message: event.message,
              }),
              actor: "system",
            },
          });
          yield {
            type: "fallback",
            reason: event.reason,
            fromAccountId: event.fromAccountId,
            toAccountId: event.toAccountId,
            message: event.message,
          };
          break;
        }
        case "done":
          doneData = {
            resultText: event.result.text,
            accountId: event.accountId,
            providerKind: event.providerKind,
            modelId: event.modelId,
            attempts: event.attempts,
            usage: event.result.usage,
            latencyMs: event.result.firstTokenLatencyMs,
          };
          break;
        case "failed":
          failed = {
            error: event.error,
            preservePartial: event.preservePartial,
          };
          break;
      }
    }
  } finally {
    input.signal?.removeEventListener("abort", onAbort);
  }

  if (doneData) {
    const finalText = doneData.resultText || assistantText;
    const finalUsage = doneData.usage ?? usage;
    const account = await ctx.prisma.providerAccount.findUnique({
      where: { id: doneData.accountId },
      select: { providerId: true },
    });

    const assistantMessage = await appendMessage(ctx.prisma, {
      conversationId: conversation.id,
      role: "ASSISTANT",
      content: finalText,
      providerAccountId: doneData.accountId,
      modelId: doneData.modelId,
      inputTokens: finalUsage?.inputTokens ?? null,
      outputTokens: finalUsage?.outputTokens ?? null,
      metadata: jsonSafe({
        finishReason: "stop",
        attempts: doneData.attempts,
        fallbackUsed,
        ...(resolved.routingRule ? { routingRule: resolved.routingRule.name } : {}),
      }),
    });

    await ctx.prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        activeAccountId: doneData.accountId,
        lastMessageAt: new Date(),
        version: { increment: 1 },
      },
    });

    const cost =
      account !== null
        ? await estimateCost(ctx, account.providerId, doneData.modelId, finalUsage)
        : null;

    await ctx.prisma.usageEvent.create({
      data: {
        providerAccountId: doneData.accountId,
        conversationId: conversation.id,
        modelId: doneData.modelId,
        status: "success",
        inputTokens: finalUsage?.inputTokens ?? null,
        outputTokens: finalUsage?.outputTokens ?? null,
        estimatedCostUsd: cost === null ? null : cost.toFixed(6),
        latencyMs: doneData.latencyMs ?? null,
        source: finalUsage ? "PROVIDER_API" : "UNAVAILABLE",
      },
    });

    const periodStart = startOfUtcDay();
    await ctx.prisma.providerUsage.upsert({
      where: {
        providerAccountId_periodStart: {
          providerAccountId: doneData.accountId,
          periodStart,
        },
      },
      create: {
        providerAccountId: doneData.accountId,
        periodStart,
        requestCount: 1,
        successCount: 1,
        inputTokens: finalUsage?.inputTokens ?? null,
        outputTokens: finalUsage?.outputTokens ?? null,
        estimatedCostUsd: cost === null ? null : cost.toFixed(6),
        source: finalUsage ? "PROVIDER_API" : "UNAVAILABLE",
        lastRequestAt: new Date(),
      },
      update: {
        requestCount: { increment: 1 },
        successCount: { increment: 1 },
        inputTokens:
          finalUsage?.inputTokens === undefined
            ? undefined
            : { increment: finalUsage.inputTokens },
        outputTokens:
          finalUsage?.outputTokens === undefined
            ? undefined
            : { increment: finalUsage.outputTokens },
        lastRequestAt: new Date(),
        source: finalUsage ? "PROVIDER_API" : "UNAVAILABLE",
      },
    });

    await ctx.prisma.conversationEvent.create({
      data: {
        conversationId: conversation.id,
        type: "assistant_message",
        payload: jsonSafe({
          messageId: assistantMessage.id,
          accountId: doneData.accountId,
          providerKind: doneData.providerKind,
          modelId: doneData.modelId,
          usage: finalUsage,
          attempts: doneData.attempts,
          fallbackUsed,
          routingRule: resolved.routingRule?.name,
        }),
        actor: "assistant",
      },
    });

    const snapshotVersion = await nextContextVersion(ctx.prisma, conversation.id);
    await ctx.prisma.contextSnapshot.create({
      data: {
        conversationId: conversation.id,
        version: snapshotVersion,
        trigger: fallbackUsed ? "PROVIDER_SWITCH" : "USER_MESSAGE",
        tokenCount: context.tokenEstimate,
        content: jsonSafe({
          system: context.system,
          messages: context.messages,
          includedMessages: context.includedMessages,
          omittedMessages: context.omittedMessages,
          repositoryHits: contextMeta.repositoryHits,
          accountId: doneData.accountId,
          modelId: doneData.modelId,
        }),
      },
    });

    clearCooldown(doneData.accountId);

    yield {
      type: "done",
      messageId: assistantMessage.id,
      accountId: doneData.accountId,
      providerKind: doneData.providerKind,
      modelId: doneData.modelId,
      usage: finalUsage,
      attempts: doneData.attempts,
      context: contextMeta,
    };
    return;
  }

  const error = failed?.error ?? {
    kind: "unknown" as const,
    message: "The provider did not return a response.",
    retryable: false,
  };
  const preservePartial = failed?.preservePartial ?? false;

  if (preservePartial && assistantText) {
    await appendMessage(ctx.prisma, {
      conversationId: conversation.id,
      role: "ASSISTANT",
      content: assistantText,
      metadata: jsonSafe({ partial: true, error }),
    });
  }

  await ctx.prisma.conversationEvent.create({
    data: {
      conversationId: conversation.id,
      type: "assistant_error",
      payload: jsonSafe({
        error,
        partial: preservePartial,
        text: preservePartial ? assistantText : undefined,
      }),
      actor: "system",
    },
  });

  yield {
    type: "error",
    error,
    partial: preservePartial,
    text: preservePartial ? assistantText : undefined,
  };
}
