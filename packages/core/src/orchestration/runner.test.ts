import { describe, expect, it } from "vitest";
import type { ChatMessage, ChatRequest, ProviderModelInfo } from "@onego/shared";
import { SimulatedAdapter } from "../adapters/simulated.js";
import { ProviderError } from "../errors/provider-error.js";
import type { AttemptTarget, RunnerEvent } from "../orchestration/runner.js";
import { FallbackRunner } from "../orchestration/runner.js";

const messages: ChatMessage[] = [
  { role: "user", content: "Build an authentication system for the project." },
  {
    role: "assistant",
    content: "I created middleware in src/auth.ts and still need to wire the routes.",
  },
  { role: "user", content: "Continue with the route wiring." },
];

const request: ChatRequest = { model: "unused", messages };

function target(
  kind: AttemptTarget["providerKind"],
  adapter: SimulatedAdapter,
  accountId = `${kind}-account`,
  modelId = `${kind}-model`,
): AttemptTarget & { received?: ChatRequest[] } {
  return {
    accountId,
    label: kind,
    providerKind: kind,
    modelId,
    adapter,
    invocation: {
      accountId,
      requestId: `req-${kind}`,
      credentials: { method: "api_key", apiKey: "test" },
    },
  };
}

async function collect(
  runner: FallbackRunner,
  targets: AttemptTarget[],
  options: Parameters<FallbackRunner["stream"]>[2] = {},
): Promise<RunnerEvent[]> {
  const events: RunnerEvent[] = [];
  for await (const event of runner.stream(request, targets, options)) {
    events.push(event);
  }
  return events;
}

describe("FallbackRunner", () => {
  it("switches from an exhausted provider to the next one with full context (acceptance test)", async () => {
    const received: ChatRequest[] = [];
    const claude = new SimulatedAdapter("anthropic", {
      type: "quota_exhausted",
      message: "You have reached your usage limit",
    });
    const codex = new SimulatedAdapter("openai", {
      type: "success",
      text: "Wiring the auth routes now.",
    });

    const codexTarget = target("openai", codex);
    const claudeTarget = target("anthropic", claude);

    const originalClaudeStream = claude.streamResponse.bind(claude);
    claude.streamResponse = async function* (req, inv) {
      received.push(structuredClone(req));
      yield* originalClaudeStream(req, inv);
    };
    const originalCodexStream = codex.streamResponse.bind(codex);
    codex.streamResponse = async function* (req, inv) {
      received.push(structuredClone(req));
      yield* originalCodexStream(req, inv);
    };

    const events = await collect(new FallbackRunner(), [claudeTarget, codexTarget]);

    const fallback = events.find((event) => event.type === "fallback");
    expect(fallback).toMatchObject({
      type: "fallback",
      reason: "quota_exhausted",
      fromProviderKind: "anthropic",
      toProviderKind: "openai",
    });
    expect(fallback && "message" in fallback ? fallback.message : "").toContain(
      "context have been preserved",
    );

    // Both providers received the identical conversation context.
    expect(received).toHaveLength(2);
    expect(received[1]?.messages).toEqual(received[0]?.messages);
    expect(received[1]?.model).toBe("openai-model");

    const done = events.find((event) => event.type === "done");
    expect(done).toMatchObject({
      type: "done",
      providerKind: "openai",
      accountId: "openai-account",
    });

    const text = events
      .filter((event) => event.type === "text_delta")
      .map((event) => (event.type === "text_delta" ? event.delta : ""))
      .join("");
    expect(text).toBe("Wiring the auth routes now.");
  });

  it("never retries a provider after quota exhaustion", async () => {
    let claudeCalls = 0;
    const claude = new SimulatedAdapter("anthropic", () => {
      claudeCalls += 1;
      return { type: "quota_exhausted" };
    });
    const codex = new SimulatedAdapter("openai", { type: "success", text: "ok" });

    await collect(new FallbackRunner(), [
      target("anthropic", claude),
      target("openai", codex),
    ]);

    expect(claudeCalls).toBe(1);
  });

  it("stops after partial output to avoid duplicated content and billing", async () => {
    const partial = new SimulatedAdapter("anthropic", { type: "success", text: "" });
    partial.streamResponse = async function* () {
      yield { type: "text_delta", delta: "partial answer" };
      throw new ProviderError({
        kind: "quota_exhausted",
        message: "quota hit mid-stream",
      });
    };
    const codex = new SimulatedAdapter("openai", { type: "success", text: "other" });

    const events = await collect(new FallbackRunner(), [
      target("anthropic", partial),
      target("openai", codex),
    ]);

    expect(events.some((event) => event.type === "fallback")).toBe(false);
    expect(events.at(-1)).toMatchObject({
      type: "failed",
      preservePartial: true,
      error: { kind: "quota_exhausted" },
    });
  });

  it("retries a rate-limited provider after the retry-after window", async () => {
    let calls = 0;
    const adapter = new SimulatedAdapter("anthropic", () => {
      calls += 1;
      return calls === 1
        ? { type: "rate_limited", retryAfterMs: 1_000 }
        : { type: "success", text: "recovered" };
    });
    const waited: number[] = [];

    const events = await collect(
      new FallbackRunner(),
      [target("anthropic", adapter)],
      {
        wait: async (ms) => {
          waited.push(ms);
        },
      },
    );

    expect(waited).toEqual([1_000]);
    expect(calls).toBe(2);
    expect(events.at(-1)).toMatchObject({ type: "done", attempts: 2 });
  });

  it("retries transient server errors once before switching", async () => {
    let calls = 0;
    const flaky = new SimulatedAdapter("openai", () => {
      calls += 1;
      return calls === 1
        ? { type: "server_error" }
        : { type: "success", text: "second try" };
    });

    const events = await collect(new FallbackRunner(), [target("openai", flaky)]);

    expect(calls).toBe(2);
    expect(events.at(-1)?.type).toBe("done");
  });

  it("fails cleanly when no providers are available", async () => {
    const events = await collect(new FallbackRunner(), []);
    expect(events[0]).toMatchObject({ type: "failed", attempts: 0 });
  });

  it("respects the global attempt budget", async () => {
    let calls = 0;
    const down = new SimulatedAdapter("openai", () => {
      calls += 1;
      return { type: "server_error" };
    });
    const alsoDown = new SimulatedAdapter("anthropic", { type: "quota_exhausted" });

    const events = await collect(
      new FallbackRunner(),
      [target("openai", down), target("anthropic", alsoDown)],
      { maxAttempts: 2, maxRetriesPerTarget: 5 },
    );

    expect(calls).toBe(2);
    expect(events.at(-1)?.type).toBe("failed");
  });
});

describe("simulated adapter", () => {
  it("exposes models and marks usage as unavailable", async () => {
    const adapter = new SimulatedAdapter("qoder", { type: "success", text: "x" });
    const models: ProviderModelInfo[] = await adapter.getAvailableModels({
      accountId: "a",
      requestId: "r",
      credentials: { method: "cli_pat", token: "t" },
    });
    expect(models[0]?.id).toBe("qoder-sim");

    const usage = await adapter.getUsage?.({
      accountId: "a",
      requestId: "r",
      credentials: { method: "cli_pat", token: "t" },
    });
    expect(usage?.source).toBe("unavailable");
  });
});
