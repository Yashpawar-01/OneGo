import type { TokenUsage } from "./chat.js";
import type { ProviderKind, UsageReportingLevel } from "./provider.js";

export type UsageSource =
  | "provider_api"
  | "rate_limit_headers"
  | "estimated"
  | "unavailable";

export type RateLimitStatus = {
  limited: boolean;
  retryAfterMs?: number;
  remainingRequests?: number;
  remainingTokens?: number;
  resetAt?: string;
  /** e.g. "requests", "tokens", "input-tokens". */
  scope?: string;
};

export type QuotaStatus = {
  exhausted: boolean;
  resetAt?: string;
  detail?: string;
};

export type ProviderUsageSnapshot = {
  providerKind: ProviderKind;
  accountId: string;
  /** Precision of the data below; drives the "usage unavailable" UI states. */
  reporting: UsageReportingLevel;
  source: UsageSource;
  quota?: QuotaStatus;
  rateLimit?: RateLimitStatus;
  tokens?: TokenUsage;
  observedAt: string;
  /** Human-readable caveat, e.g. why subscription quota cannot be read. */
  note?: string;
};
