import type {
  ChatRequest,
  ChatResult,
  ConnectionValidation,
  ProviderKind,
  ProviderModelInfo,
  ProviderUsageSnapshot,
  StreamEvent,
} from "@onego/shared";
import { ProviderError } from "../errors/provider-error.js";
import type { AdapterInvocation, ProviderAdapter } from "../providers/adapter.js";

export type SimulatedScript =
  | { type: "success"; text: string; chunkSize?: number }
  | { type: "quota_exhausted"; message?: string }
  | { type: "rate_limited"; retryAfterMs?: number }
  | { type: "server_error"; message?: string };

/**
 * Deterministic adapter used by tests and local demos to exercise fallback
 * logic without consuming provider credits. Never registered in production.
 */
export class SimulatedAdapter implements ProviderAdapter {
  readonly capabilities = {
    chat: true,
    streaming: true,
    toolCalling: false,
    vision: false,
    usageReporting: "none" as const,
    integration: "http" as const,
  };
  readonly authMethods = ["api_key"] as const;

  constructor(
    readonly kind: ProviderKind,
    private readonly script: SimulatedScript | ((request: ChatRequest) => SimulatedScript),
  ) {}

  async validateConnection(): Promise<ConnectionValidation> {
    return {
      ok: true,
      status: "connected",
      latencyMs: 1,
      checkedAt: new Date().toISOString(),
    };
  }

  async getAvailableModels(
    _invocation: AdapterInvocation,
  ): Promise<ProviderModelInfo[]> {
    return [
      {
        id: `${this.kind}-sim`,
        displayName: `${this.kind} (simulated)`,
        contextWindow: 100_000,
        supportsTools: false,
        supportsVision: false,
      },
    ];
  }

  async getUsage(
    _invocation: AdapterInvocation,
  ): Promise<ProviderUsageSnapshot> {
    return {
      providerKind: this.kind,
      accountId: _invocation.accountId,
      reporting: "none",
      source: "unavailable",
      observedAt: new Date().toISOString(),
      note: "Simulated adapter: usage is intentionally unavailable.",
    };
  }

  async sendMessage(
    request: ChatRequest,
    _invocation: AdapterInvocation,
  ): Promise<ChatResult> {
    const script = this.resolve(request);
    if (script.type !== "success") {
      throw this.failure(script);
    }
    return {
      text: script.text,
      toolCalls: [],
      finishReason: "stop",
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    };
  }

  async *streamResponse(
    request: ChatRequest,
    _invocation: AdapterInvocation,
  ): AsyncIterable<StreamEvent> {
    const script = this.resolve(request);
    if (script.type !== "success") {
      throw this.failure(script);
    }

    const size = script.chunkSize ?? 16;
    let text = "";
    for (let i = 0; i < script.text.length; i += size) {
      const delta = script.text.slice(i, i + size);
      text += delta;
      yield { type: "text_delta", delta };
    }

    yield {
      type: "done",
      result: {
        text,
        toolCalls: [],
        finishReason: "stop",
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      },
    };
  }

  toProviderError(error: unknown): ProviderError {
    if (error instanceof ProviderError) return error;
    return new ProviderError({
      kind: "unknown",
      message: error instanceof Error ? error.message : "Simulated failure",
      providerKind: this.kind,
    });
  }

  private resolve(request: ChatRequest): SimulatedScript {
    return typeof this.script === "function" ? this.script(request) : this.script;
  }

  private failure(script: SimulatedScript): ProviderError {
    if (script.type === "quota_exhausted") {
      return new ProviderError({
        kind: "quota_exhausted",
        message: script.message ?? "Simulated quota exhaustion",
        providerKind: this.kind,
        retryable: false,
      });
    }
    if (script.type === "rate_limited") {
      return new ProviderError({
        kind: "rate_limited",
        message: "Simulated rate limit",
        providerKind: this.kind,
        retryable: true,
        retryAfterMs: script.retryAfterMs,
      });
    }
    if (script.type === "server_error") {
      return new ProviderError({
        kind: "server",
        message: script.message ?? "Simulated server error",
        providerKind: this.kind,
        retryable: true,
      });
    }
    return new ProviderError({
      kind: "unknown",
      message: "Unhandled simulated script",
      providerKind: this.kind,
    });
  }
}
