import type {
  AuthMethod as PrismaAuthMethod,
  PrismaClient,
  ProviderKind as PrismaProviderKind,
} from "@prisma/client";
import type { AuthMethod, ProviderCapabilities, ProviderKind } from "@onego/shared";

export const SHARED_TO_PRISMA_KIND: Record<ProviderKind, PrismaProviderKind> = {
  openai: "OPENAI",
  anthropic: "ANTHROPIC",
  github: "GITHUB",
  qoder: "QODER",
};

export const SHARED_TO_PRISMA_AUTH: Record<AuthMethod, PrismaAuthMethod> = {
  api_key: "API_KEY",
  oauth: "OAUTH",
  cli_pat: "CLI_PAT",
};

export function toSharedKind(kind: PrismaProviderKind): ProviderKind {
  return kind.toLowerCase() as ProviderKind;
}

export function toSharedAuthMethod(method: PrismaAuthMethod): AuthMethod {
  return method.toLowerCase() as AuthMethod;
}

export type CatalogEntry = {
  key: string;
  name: string;
  kind: ProviderKind;
  authMethods: AuthMethod[];
  docsUrl: string;
  capabilities: ProviderCapabilities;
};

export const PROVIDER_CATALOG: CatalogEntry[] = [
  {
    key: "openai",
    name: "OpenAI / Codex",
    kind: "openai",
    authMethods: ["api_key"],
    docsUrl: "https://platform.openai.com/docs/api-reference",
    capabilities: {
      chat: true,
      streaming: true,
      toolCalling: true,
      vision: true,
      usageReporting: "exact",
      integration: "http",
    },
  },
  {
    key: "anthropic",
    name: "Anthropic / Claude",
    kind: "anthropic",
    authMethods: ["api_key"],
    docsUrl: "https://docs.anthropic.com/en/api/messages",
    capabilities: {
      chat: true,
      streaming: true,
      toolCalling: true,
      vision: true,
      usageReporting: "rate_limits_only",
      integration: "http",
    },
  },
  {
    key: "github-copilot",
    name: "GitHub Copilot",
    kind: "github",
    authMethods: ["cli_pat"],
    docsUrl: "https://github.com/github/copilot-sdk",
    capabilities: {
      chat: true,
      streaming: true,
      toolCalling: false,
      vision: true,
      usageReporting: "rate_limits_only",
      integration: "sdk",
    },
  },
  {
    key: "qoder",
    name: "Qoder",
    kind: "qoder",
    authMethods: ["cli_pat"],
    docsUrl: "https://docs.qoder.com/cli/authentication",
    capabilities: {
      chat: true,
      streaming: true,
      toolCalling: false,
      vision: false,
      usageReporting: "none",
      integration: "cli",
    },
  },
];

export function catalogForSharedKind(kind: ProviderKind): CatalogEntry | undefined {
  return PROVIDER_CATALOG.find((entry) => entry.kind === kind);
}

/** Idempotently mirrors the static catalog into the database. */
export async function seedProviderCatalog(prisma: PrismaClient): Promise<void> {
  for (const entry of PROVIDER_CATALOG) {
    const data = {
      name: entry.name,
      kind: SHARED_TO_PRISMA_KIND[entry.kind],
      authMethods: entry.authMethods.map((method) => SHARED_TO_PRISMA_AUTH[method]),
      docsUrl: entry.docsUrl,
      capabilities: entry.capabilities,
    };
    await prisma.provider.upsert({
      where: { key: entry.key },
      create: { key: entry.key, ...data },
      update: data,
    });
  }
}
