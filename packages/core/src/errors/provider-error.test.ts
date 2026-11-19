import { describe, expect, it } from "vitest";
import {
  ProviderError,
  classifyProviderError,
  parseRetryAfterMs,
} from "../errors/provider-error.js";

const headers = (values: Record<string, string>): Headers => {
  const result = new Headers();
  for (const [key, value] of Object.entries(values)) result.set(key, value);
  return result;
};

describe("classifyProviderError", () => {
  it("treats 401 as a non-retryable auth failure", () => {
    const error = classifyProviderError({
      providerKind: "openai",
      status: 401,
      body: { error: { message: "Invalid API key", code: "invalid_api_key" } },
    });

    expect(error.kind).toBe("auth");
    expect(error.retryable).toBe(false);
    expect(error.providerCode).toBe("invalid_api_key");
  });

  it("detects hard quota exhaustion on 429 and never marks it retryable", () => {
    const error = classifyProviderError({
      providerKind: "openai",
      status: 429,
      headers: headers({ "retry-after": "60" }),
      body: {
        error: {
          message: "You exceeded your current quota",
          code: "insufficient_quota",
        },
      },
    });

    expect(error.kind).toBe("quota_exhausted");
    expect(error.retryable).toBe(false);
    expect(error.retryAfterMs).toBe(60_000);
  });

  it("detects Anthropic usage-limit style quota errors", () => {
    const error = classifyProviderError({
      providerKind: "anthropic",
      status: 429,
      body: {
        type: "error",
        error: {
          type: "rate_limit_error",
          message: "You have reached your monthly usage limit",
        },
      },
    });

    expect(error.kind).toBe("quota_exhausted");
  });

  it("treats a plain 429 as a retryable rate limit with retry-after honored", () => {
    const error = classifyProviderError({
      providerKind: "anthropic",
      status: 429,
      headers: headers({ "retry-after": "7" }),
      body: {
        type: "error",
        error: { type: "rate_limit_error", message: "Too many requests" },
      },
    });

    expect(error.kind).toBe("rate_limited");
    expect(error.retryable).toBe(true);
    expect(error.retryAfterMs).toBe(7_000);
  });

  it("classifies aborted requests as retryable timeouts", () => {
    const abort = new DOMException("aborted", "AbortError");
    const error = classifyProviderError({ error: abort });

    expect(error.kind).toBe("timeout");
    expect(error.retryable).toBe(true);
  });

  it("classifies fetch failures as retryable network errors", () => {
    const error = classifyProviderError({
      providerKind: "qoder",
      error: new TypeError("fetch failed"),
    });

    expect(error.kind).toBe("network");
    expect(error.retryable).toBe(true);
  });

  it("keeps 5xx as retryable server errors", () => {
    const error = classifyProviderError({
      providerKind: "openai",
      status: 529,
      body: { error: { type: "overloaded_error", message: "Overloaded" } },
    });

    expect(error.kind).toBe("server");
    expect(error.retryable).toBe(true);
  });

  it("passes an existing ProviderError through unchanged", () => {
    const original = new ProviderError({
      kind: "quota_exhausted",
      message: "no credits",
    });
    expect(classifyProviderError({ error: original })).toBe(original);
  });
});

describe("parseRetryAfterMs", () => {
  it("parses delta seconds", () => {
    expect(parseRetryAfterMs(headers({ "Retry-After": "12" }))).toBe(12_000);
  });

  it("parses HTTP dates relative to now", () => {
    const now = Date.parse("2026-01-01T00:00:00Z");
    const value = new Date(now + 30_000).toUTCString();
    expect(parseRetryAfterMs(headers({ "retry-after": value }), now)).toBe(
      30_000,
    );
  });

  it("returns undefined when the header is absent", () => {
    expect(parseRetryAfterMs(undefined)).toBeUndefined();
  });
});
