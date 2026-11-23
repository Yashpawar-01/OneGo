import { randomUUID } from "node:crypto";
import type {
  Provider,
  ProviderAccount,
  ProviderModel,
  AccountStatus,
} from "@prisma/client";
import type {
  ConnectionValidation,
  ProviderModelInfo,
  ProviderUsageSnapshot,
  UsageReportingLevel,
} from "@onego/shared";
import type { AdapterInvocation } from "@onego/core";
import { badRequest, notFound } from "../lib/http-error.js";
import type { ServiceContext } from "./context.js";
import { decryptCredentials } from "./credentials.js";
import { toSharedAuthMethod, toSharedKind } from "../providers/catalog.js";

export type ProviderWithModels = Provider & { models: ProviderModel[] };
export type AccountWithProvider = ProviderAccount & { provider: ProviderWithModels };

export function toProviderModelInfo(model: ProviderModel): ProviderModelInfo {
  return {
    id: model.modelId,
    displayName: model.displayName,
    contextWindow: model.contextWindow ?? undefined,
    maxOutputTokens: model.maxOutputTokens ?? undefined,
    supportsTools: model.supportsTools,
    supportsVision: model.supportsVision,
    inputCostPerMTok:
      model.inputCostPerMTok === null
        ? undefined
        : Number(model.inputCostPerMTok.toString()),
    outputCostPerMTok:
      model.outputCostPerMTok === null
        ? undefined
        : Number(model.outputCostPerMTok.toString()),
  };
}

export function accountDto(account: AccountWithProvider) {
  const metadata = (account.metadata ?? {}) as Record<string, unknown>;
  return {
    id: account.id,
    label: account.label,
    providerKey: account.provider.key,
    providerKind: toSharedKind(account.provider.kind),
    providerName: account.provider.name,
    authMethod: toSharedAuthMethod(account.authMethod),
    status: account.status.toLowerCase() as Lowercase<AccountStatus>,
    statusMessage: account.statusMessage,
    priority: account.priority,
    enabled: account.enabled,
    credentialHint: typeof metadata.credentialHint === "string" ? metadata.credentialHint : null,
    defaultModel: typeof metadata.defaultModel === "string" ? metadata.defaultModel : null,
    lastValidatedAt: account.lastValidatedAt?.toISOString() ?? null,
    lastUsedAt: account.lastUsedAt?.toISOString() ?? null,
    createdAt: account.createdAt.toISOString(),
  };
}

export async function getOwnedAccount(
  ctx: ServiceContext,
  userId: string,
  accountId: string,
): Promise<AccountWithProvider> {
  const account = await ctx.prisma.providerAccount.findFirst({
    where: { id: accountId, userId },
    include: { provider: { include: { models: true } } },
  });
  if (!account) throw notFound("Provider account");
  return account;
}

export function invocationFor(
  account: AccountWithProvider,
  encryptionKey: string,
): AdapterInvocation {
  return {
    requestId: randomUUID(),
    accountId: account.id,
    credentials: decryptCredentials(account.credentialCiphertext, encryptionKey),
  };
}

function adapterForAccount(ctx: ServiceContext, account: AccountWithProvider) {
  const kind = toSharedKind(account.provider.kind);
  const adapter = ctx.registry.get(kind);
  if (!adapter) {
    throw badRequest(`No adapter is registered for provider "${kind}"`);
  }
  return { kind, adapter };
}

export async function validateAccount(
  ctx: ServiceContext,
  account: AccountWithProvider,
): Promise<ConnectionValidation> {
  const { adapter } = adapterForAccount(ctx, account);
  const invocation = invocationFor(account, ctx.encryptionKey);

  let validation: ConnectionValidation;
  try {
    validation = await adapter.validateConnection(invocation);
  } catch (error) {
    const providerError = adapter.toProviderError(error);
    validation = {
      ok: false,
      status: providerError.kind === "auth" ? "expired" : "error",
      message: providerError.message,
      checkedAt: new Date().toISOString(),
    };
  }

  const status: AccountStatus = validation.ok
    ? "CONNECTED"
    : validation.status === "expired"
      ? "EXPIRED"
      : "ERROR";

  await ctx.prisma.providerAccount.update({
    where: { id: account.id },
    data: {
      status,
      statusMessage: validation.message ?? null,
      lastValidatedAt: new Date(),
    },
  });

  return validation;
}

export async function syncProviderModels(
  ctx: ServiceContext,
  account: AccountWithProvider,
): Promise<ProviderModelInfo[]> {
  const { adapter } = adapterForAccount(ctx, account);
  const invocation = invocationFor(account, ctx.encryptionKey);

  let models: ProviderModelInfo[];
  try {
    models = await adapter.getAvailableModels(invocation);
  } catch (error) {
    throw adapter.toProviderError(error);
  }

  const providerId = account.providerId;
  for (const model of models) {
    const data = {
      displayName: model.displayName,
      contextWindow: model.contextWindow ?? null,
      maxOutputTokens: model.maxOutputTokens ?? null,
      supportsTools: model.supportsTools,
      supportsVision: model.supportsVision,
      inputCostPerMTok: model.inputCostPerMTok ?? null,
      outputCostPerMTok: model.outputCostPerMTok ?? null,
      available: true,
    };
    await ctx.prisma.providerModel.upsert({
      where: {
        providerId_modelId: { providerId, modelId: model.id },
      },
      create: { providerId, modelId: model.id, ...data },
      update: data,
    });
  }

  const seen = models.map((model) => model.id);
  await ctx.prisma.providerModel.updateMany({
    where: { providerId, modelId: { notIn: seen } },
    data: { available: false },
  });

  return models;
}

export async function accountUsageSnapshot(
  ctx: ServiceContext,
  account: AccountWithProvider,
  refresh: boolean,
): Promise<ProviderUsageSnapshot> {
  const { kind, adapter } = adapterForAccount(ctx, account);
  const fallbackNote =
    "OneGo only shows usage reported through official provider channels; no values are estimated.";

  if (adapter.capabilities.usageReporting === "none") {
    return {
      providerKind: kind,
      accountId: account.id,
      reporting: "none" satisfies UsageReportingLevel,
      source: "unavailable",
      observedAt: new Date().toISOString(),
      note: fallbackNote,
    };
  }

  if (refresh && adapter.getUsage) {
    try {
      const snapshot = await adapter.getUsage(invocationFor(account, ctx.encryptionKey));
      return snapshot;
    } catch (error) {
      const providerError = adapter.toProviderError(error);
      return {
        providerKind: kind,
        accountId: account.id,
        reporting: adapter.capabilities.usageReporting,
        source: "unavailable",
        observedAt: new Date().toISOString(),
        note: providerError.message,
      };
    }
  }

  const latest = await ctx.prisma.providerUsage.findFirst({
    where: { providerAccountId: account.id },
    orderBy: { periodStart: "desc" },
  });

  if (!latest) {
    return {
      providerKind: kind,
      accountId: account.id,
      reporting: adapter.capabilities.usageReporting,
      source: "unavailable",
      observedAt: new Date().toISOString(),
      note: "No usage has been recorded for this account yet. " + fallbackNote,
    };
  }

  return {
    providerKind: kind,
    accountId: account.id,
    reporting: adapter.capabilities.usageReporting,
    source:
      latest.source === "PROVIDER_API"
        ? "provider_api"
        : latest.source === "RATE_LIMIT_HEADERS"
          ? "rate_limit_headers"
          : latest.source === "ESTIMATED"
            ? "estimated"
            : "unavailable",
    tokens:
      latest.inputTokens === null && latest.outputTokens === null
        ? undefined
        : {
            inputTokens: latest.inputTokens ?? undefined,
            outputTokens: latest.outputTokens ?? undefined,
          },
    quota:
      latest.quotaRemaining === null && latest.quotaLimit === null
        ? undefined
        : {
            exhausted: latest.quotaRemaining !== null && latest.quotaRemaining <= 0,
            resetAt: latest.resetAt?.toISOString(),
          },
    observedAt: latest.lastRequestAt?.toISOString() ?? latest.updatedAt.toISOString(),
    note:
      "Token totals come from recorded OneGo requests. Quota values are only shown when the provider exposes them officially.",
  };
}

export function providerCapabilities(account: AccountWithProvider): unknown {
  return account.provider.capabilities;
}
