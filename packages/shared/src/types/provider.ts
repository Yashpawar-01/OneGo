export type ProviderKind = "openai" | "anthropic" | "github" | "qoder";

export type AuthMethod = "api_key" | "oauth" | "cli_pat";

/**
 * How precisely a provider exposes usage/quota data through official channels.
 * Used by the UI to avoid fabricating numbers (see docs/provider-integrations.md).
 */
export type UsageReportingLevel = "exact" | "rate_limits_only" | "none";

export type ProviderCapabilities = {
  chat: boolean;
  streaming: boolean;
  toolCalling: boolean;
  vision: boolean;
  usageReporting: UsageReportingLevel;
  /** Transport used by the adapter: HTTP API, official SDK, or authorized local CLI. */
  integration: "http" | "sdk" | "cli";
};

export type ProviderModelInfo = {
  id: string;
  displayName: string;
  contextWindow: number;
  maxOutputTokens?: number;
  supportsTools: boolean;
  supportsVision: boolean;
  inputCostPerMTok?: number;
  outputCostPerMTok?: number;
};

export type ConnectionStatus = "connected" | "error" | "expired" | "disabled";

export type ConnectionValidation = {
  ok: boolean;
  status: ConnectionStatus;
  message?: string;
  latencyMs?: number;
  checkedAt: string;
};

/** Discriminated union of credentials after decryption. Never logged or serialized to clients. */
export type ProviderCredentials =
  | { method: "api_key"; apiKey: string }
  | { method: "oauth"; accessToken: string; refreshToken?: string; expiresAt?: string }
  | { method: "cli_pat"; token: string };

export type ProviderErrorKind =
  | "auth"
  | "permission"
  | "quota_exhausted"
  | "rate_limited"
  | "timeout"
  | "network"
  | "invalid_request"
  | "content_policy"
  | "server"
  | "unknown";

export type ProviderErrorInfo = {
  kind: ProviderErrorKind;
  message: string;
  retryable: boolean;
  retryAfterMs?: number;
  statusCode?: number;
  providerCode?: string;
  requestId?: string;
};
