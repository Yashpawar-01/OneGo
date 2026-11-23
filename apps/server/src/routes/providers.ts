import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import type { AuthMethod } from "@onego/shared";
import { badRequest, notFound } from "../lib/http-error.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseBody } from "../lib/validate.js";
import type { AuthedRequest } from "../middleware/auth.js";
import type { ServiceContext } from "../services/context.js";
import {
  accountDto,
  accountUsageSnapshot,
  getOwnedAccount,
  syncProviderModels,
  toProviderModelInfo,
  validateAccount,
} from "../services/accounts.js";
import { clearCooldown } from "../services/cooldowns.js";
import {
  credentialsFromInput,
  encryptCredentials,
} from "../services/credentials.js";
import {
  seedProviderCatalog,
  toSharedAuthMethod,
  toSharedKind,
} from "../providers/catalog.js";

const credentialsSchema = z
  .object({
    apiKey: z.string().min(1).max(4000).optional(),
    token: z.string().min(1).max(4000).optional(),
    accessToken: z.string().min(1).max(4000).optional(),
    refreshToken: z.string().max(4000).optional(),
    expiresAt: z.string().max(80).optional(),
  })
  .strict();

const createAccountSchema = z.object({
  label: z.string().trim().min(1).max(80).default("default"),
  authMethod: z.enum(["api_key", "oauth", "cli_pat"]).optional(),
  credentials: credentialsSchema,
  priority: z.coerce.number().int().min(0).max(10_000).default(100),
  enabled: z.boolean().default(true),
  defaultModel: z.string().trim().max(200).optional(),
});

const updateAccountSchema = z
  .object({
    label: z.string().trim().min(1).max(80).optional(),
    priority: z.coerce.number().int().min(0).max(10_000).optional(),
    enabled: z.boolean().optional(),
    credentials: credentialsSchema.optional(),
    defaultModel: z.string().trim().max(200).nullable().optional(),
  })
  .strict();

function metadataRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? ({ ...(value as Record<string, unknown>) } as Record<string, unknown>)
    : {};
}

export function createProvidersRouter(ctx: ServiceContext): Router {
  const router = Router();

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const { userId } = req as AuthedRequest;
      await seedProviderCatalog(ctx.prisma);

      const [providers, accounts] = await Promise.all([
        ctx.prisma.provider.findMany({
          orderBy: { name: "asc" },
          include: { models: { where: { available: true }, orderBy: { displayName: "asc" } } },
        }),
        ctx.prisma.providerAccount.findMany({
          where: { userId },
          include: { provider: { include: { models: true } } },
          orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
        }),
      ]);

      res.json({
        providers: providers.map((provider) => ({
          id: provider.id,
          key: provider.key,
          name: provider.name,
          kind: toSharedKind(provider.kind),
          authMethods: provider.authMethods.map(toSharedAuthMethod),
          docsUrl: provider.docsUrl,
          capabilities: provider.capabilities,
          models: provider.models.map(toProviderModelInfo),
          accounts: accounts
            .filter((account) => account.providerId === provider.id)
            .map(accountDto),
        })),
      });
    }),
  );

  router.post(
    "/:providerKey/accounts",
    asyncHandler(async (req, res) => {
      const { userId } = req as AuthedRequest;
      const providerKey = req.params.providerKey as string;
      const body = parseBody(createAccountSchema, req.body);

      const provider = await ctx.prisma.provider.findUnique({
        where: { key: providerKey },
      });
      if (!provider) throw notFound("Provider");

      const allowed = provider.authMethods.map(toSharedAuthMethod);
      const authMethod: AuthMethod = body.authMethod ?? allowed[0] ?? "api_key";
      if (!allowed.includes(authMethod)) {
        throw badRequest(
          `${provider.name} supports ${allowed.join(", ")} authentication`,
        );
      }

      const credentials = credentialsFromInput(authMethod, body.credentials);
      const encrypted = encryptCredentials(credentials, ctx.encryptionKey);

      let account;
      try {
        account = await ctx.prisma.providerAccount.create({
          data: {
            userId,
            providerId: provider.id,
            label: body.label,
            authMethod:
              provider.authMethods[allowed.indexOf(authMethod)] ?? "API_KEY",
            credentialCiphertext: encrypted.ciphertext,
            credentialKeyVersion: encrypted.keyVersion,
            priority: body.priority,
            enabled: body.enabled,
            metadata: {
              credentialHint: encrypted.hint,
              ...(body.defaultModel ? { defaultModel: body.defaultModel } : {}),
            },
          },
          include: { provider: { include: { models: true } } },
        });
      } catch (error) {
        if ((error as { code?: string }).code === "P2002") {
          throw badRequest(`An account labeled "${body.label}" already exists for this provider`);
        }
        throw error;
      }

      const validation = await validateAccount(ctx, account);
      if (validation.ok) {
        try {
          await syncProviderModels(ctx, account);
        } catch {
          // Validation already succeeded; model sync can be retried explicitly.
        }
      }

      const refreshed = await getOwnedAccount(ctx, userId, account.id);
      res.status(201).json({
        account: accountDto(refreshed),
        validation,
      });
    }),
  );

  router.patch(
    "/accounts/:accountId",
    asyncHandler(async (req, res) => {
      const { userId } = req as AuthedRequest;
      const body = parseBody(updateAccountSchema, req.body);
      const account = await getOwnedAccount(ctx, userId, req.params.accountId as string);

      const metadata = metadataRecord(account.metadata);
      let credentialUpdate:
        | { credentialCiphertext: string; credentialKeyVersion: number }
        | undefined;

      if (body.credentials) {
        const authMethod = toSharedAuthMethod(account.authMethod);
        const credentials = credentialsFromInput(authMethod, body.credentials);
        const encrypted = encryptCredentials(credentials, ctx.encryptionKey);
        metadata.credentialHint = encrypted.hint;
        credentialUpdate = {
          credentialCiphertext: encrypted.ciphertext,
          credentialKeyVersion: encrypted.keyVersion,
        };
      }

      if (body.defaultModel !== undefined) {
        if (body.defaultModel === null || body.defaultModel === "") {
          delete metadata.defaultModel;
        } else {
          metadata.defaultModel = body.defaultModel;
        }
      }

      await ctx.prisma.providerAccount.update({
        where: { id: account.id },
        data: {
          ...(body.label !== undefined ? { label: body.label } : {}),
          ...(body.priority !== undefined ? { priority: body.priority } : {}),
          ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
          ...(credentialUpdate ?? {}),
          ...(credentialUpdate
            ? { status: "CONNECTED", statusMessage: null }
            : {}),
          metadata: metadata as Prisma.InputJsonValue,
        },
      });
      if (credentialUpdate) clearCooldown(account.id);

      const refreshed = await getOwnedAccount(ctx, userId, account.id);
      res.json({ account: accountDto(refreshed) });
    }),
  );

  router.delete(
    "/accounts/:accountId",
    asyncHandler(async (req, res) => {
      const { userId } = req as AuthedRequest;
      const result = await ctx.prisma.providerAccount.deleteMany({
        where: { id: req.params.accountId, userId },
      });
      if (result.count === 0) throw notFound("Provider account");
      res.status(204).end();
    }),
  );

  router.post(
    "/accounts/:accountId/validate",
    asyncHandler(async (req, res) => {
      const { userId } = req as AuthedRequest;
      const account = await getOwnedAccount(ctx, userId, req.params.accountId as string);
      const validation = await validateAccount(ctx, account);
      if (validation.ok) {
        await syncProviderModels(ctx, account).catch(() => undefined);
      }
      const refreshed = await getOwnedAccount(ctx, userId, account.id);
      res.json({ validation, account: accountDto(refreshed) });
    }),
  );

  router.post(
    "/accounts/:accountId/models/sync",
    asyncHandler(async (req, res) => {
      const { userId } = req as AuthedRequest;
      const account = await getOwnedAccount(ctx, userId, req.params.accountId as string);
      const models = await syncProviderModels(ctx, account);
      const refreshed = await getOwnedAccount(ctx, userId, account.id);
      res.json({ models, account: accountDto(refreshed) });
    }),
  );

  router.get(
    "/accounts/:accountId/usage",
    asyncHandler(async (req, res) => {
      const { userId } = req as AuthedRequest;
      const account = await getOwnedAccount(ctx, userId, req.params.accountId as string);
      const refresh = req.query.refresh === "1" || req.query.refresh === "true";
      const snapshot = await accountUsageSnapshot(ctx, account, refresh);
      res.json({ usage: snapshot });
    }),
  );

  return router;
}
