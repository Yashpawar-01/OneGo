import { createHash } from "node:crypto";
import type {
  ChatMessage,
  ChatRequest,
  ChatResult,
  ConnectionValidation,
  ContentPart,
  ProviderModelInfo,
  StreamEvent,
  TokenUsage,
} from "@onego/shared";
import {
  classifyProviderError,
  ProviderError,
  type AdapterInvocation,
  type ProviderAdapter,
} from "@onego/core";
import {
  CopilotClient,
  type CopilotSession,
  type ModelInfo,
} from "@github/copilot-sdk";

export type CopilotAdapterOptions = {
  workingDirectory?: string;
  maxRuntimeMs?: number;
  /** Keeps the pooled runtime alive between requests; stopped when idle. */
  idleShutdownMs?: number;
};

type PoolEntry = {
  client: CopilotClient;
  timer: NodeJS.Timeout;
};

class AsyncChannel<T> {
  private readonly items: T[] = [];
  private readonly waiters: Array<(result: IteratorResult<T>) => void> = [];
  private closed = false;

  push(value: T): void {
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter({ value, done: false });
      return;
    }
    this.items.push(value);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const waiter of this.waiters.splice(0)) {
      waiter({ value: undefined as never, done: true });
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        const item = this.items.shift();
        if (item !== undefined) {
          return Promise.resolve({ value: item, done: false });
        }
        if (this.closed) {
          return Promise.resolve({ value: undefined as never, done: true });
        }
        return new Promise((resolve) => this.waiters.push(resolve));
      },
    };
  }
}

function textOfContent(content: string | ContentPart[]): string {
  if (typeof content === "string") return content;
  return content
    .map((part) => (part.type === "text" ? part.text : "[image omitted]"))
    .join("\n");
}

function buildPrompt(request: ChatRequest): string {
  const lines: string[] = [];
  for (const message of request.messages as ChatMessage[]) {
    lines.push(`## ${message.role.toUpperCase()}\n${textOfContent(message.content)}`);
  }
  lines.push(
    "## ASSISTANT",
    "Reply to the last user message using the context above. Output only the assistant reply.",
  );
  return lines.join("\n\n");
}

function inferStatusFromMessage(message: string): number | undefined {
  const lower = message.toLowerCase();
  if (/quota|usage limit|credit balance|billing|no (?:remaining )?credits/.test(lower)) {
    return 429;
  }
  if (/rate limit|too many requests|\b429\b/.test(lower)) return 429;
  if (/unauthori[sz]ed|bad credentials|invalid token|authentication|\b401\b/.test(lower)) {
    return 401;
  }
  if (/forbidden|permission denied|\b403\b/.test(lower)) return 403;
  if (/timed out|timeout|\betimedout\b/.test(lower)) return 408;
  if (/not found|no such model|\b404\b/.test(lower)) return 404;
  if (/internal server|service unavailable|\b50\d\b/.test(lower)) return 503;
  return undefined;
}

function mapError(error: unknown): ProviderError {
  if (error instanceof ProviderError) return error;
  const message = error instanceof Error ? error.message : String(error);
  return classifyProviderError({
    providerKind: "github",
    status: inferStatusFromMessage(message),
    body: message,
    error,
  });
}

function mapModel(model: ModelInfo): ProviderModelInfo {
  const limits = model.capabilities?.limits;
  return {
    id: model.id,
    displayName: model.name || model.id,
    contextWindow: limits?.max_context_window_tokens,
    maxOutputTokens: limits?.max_output_tokens,
    supportsTools: false,
    supportsVision: Boolean(model.capabilities?.supports?.vision),
  };
}

/**
 * Official GitHub Copilot integration through @github/copilot-sdk.
 * The SDK owns the CLI runtime; OneGo only passes an explicit GitHub token.
 * Permission requests from agent tools are denied: this is a chat surface.
 */
export class CopilotAdapter implements ProviderAdapter {
  readonly kind = "github" as const;
  readonly capabilities = {
    chat: true,
    streaming: true,
    toolCalling: false,
    vision: true,
    usageReporting: "rate_limits_only" as const,
    integration: "sdk" as const,
  };
  readonly authMethods = ["cli_pat"] as const;

  private readonly workingDirectory?: string;
  private readonly maxRuntimeMs: number;
  private readonly idleShutdownMs: number;
  private readonly pool = new Map<string, PoolEntry>();

  constructor(options: CopilotAdapterOptions = {}) {
    this.workingDirectory = options.workingDirectory;
    this.maxRuntimeMs = options.maxRuntimeMs ?? 5 * 60_000;
    this.idleShutdownMs = options.idleShutdownMs ?? 5 * 60_000;
  }

  async validateConnection(
    invocation: AdapterInvocation,
  ): Promise<ConnectionValidation> {
    const startedAt = Date.now();
    const checkedAt = new Date().toISOString();
    try {
      const token = this.token(invocation);
      const client = await this.getClient(token);
      const status = await client.getAuthStatus();
      const latencyMs = Date.now() - startedAt;
      if (!status.isAuthenticated) {
        return {
          ok: false,
          status: "error",
          message: status.statusMessage ?? "GitHub Copilot is not authenticated",
          latencyMs,
          checkedAt,
        };
      }
      return {
        ok: true,
        status: "connected",
        message: status.login
          ? `Authenticated as ${status.login} (${status.authType ?? "token"})`
          : "GitHub Copilot authentication verified",
        latencyMs,
        checkedAt,
      };
    } catch (error) {
      return {
        ok: false,
        status: "error",
        message: mapError(error).message,
        latencyMs: Date.now() - startedAt,
        checkedAt,
      };
    }
  }

  async getAvailableModels(
    invocation: AdapterInvocation,
  ): Promise<ProviderModelInfo[]> {
    try {
      const client = await this.getClient(this.token(invocation));
      const models = await client.listModels();
      return models
        .filter((model) => model.policy?.state !== "disabled")
        .map(mapModel)
        .sort((a, b) => a.displayName.localeCompare(b.displayName));
    } catch (error) {
      throw this.toProviderError(error);
    }
  }

  async sendMessage(
    request: ChatRequest,
    invocation: AdapterInvocation,
  ): Promise<ChatResult> {
    let usage: TokenUsage | undefined;
    const session = await this.createSession(request, invocation);
    const unsubscribeUsage = session.on("assistant.usage", (event) => {
      usage = {
        inputTokens: event.data.inputTokens,
        outputTokens: event.data.outputTokens,
      };
    });
    try {
      const final = await session.sendAndWait(
        buildPrompt(request),
        this.maxRuntimeMs,
      );
      const text = final?.data.content ?? "";
      return {
        text,
        toolCalls: [],
        finishReason: "stop",
        usage,
        providerRequestId: final?.data.requestId,
      };
    } catch (error) {
      throw this.toProviderError(error);
    } finally {
      unsubscribeUsage();
      await session.disconnect().catch(() => undefined);
    }
  }

  async *streamResponse(
    request: ChatRequest,
    invocation: AdapterInvocation,
  ): AsyncIterable<StreamEvent> {
    const session = await this.createSession(request, invocation);
    const channel = new AsyncChannel<string>();
    let usage: TokenUsage | undefined;

    const unsubscribeDelta = session.on("assistant.message_delta", (event) => {
      if (event.data.deltaContent) channel.push(event.data.deltaContent);
    });
    const unsubscribeUsage = session.on("assistant.usage", (event) => {
      usage = {
        inputTokens: event.data.inputTokens,
        outputTokens: event.data.outputTokens,
      };
    });

    const sendPromise = session
      .sendAndWait(buildPrompt(request), this.maxRuntimeMs)
      .finally(() => channel.close());
    // The consumer may stop early (client disconnect); keep the rejection handled.
    sendPromise.catch(() => undefined);

    let text = "";
    try {
      for await (const delta of channel) {
        text += delta;
        yield { type: "text_delta", delta };
      }
      const final = await sendPromise;
      const resultText = final?.data.content ?? text;
      if (resultText && resultText !== text) {
        const remainder = resultText.startsWith(text)
          ? resultText.slice(text.length)
          : resultText;
        if (remainder) {
          text = resultText;
          yield { type: "text_delta", delta: remainder };
        }
      }
      if (usage) yield { type: "usage", usage };
      yield {
        type: "done",
        result: {
          text,
          toolCalls: [],
          finishReason: "stop",
          usage,
          providerRequestId: final?.data.requestId,
        },
      };
    } catch (error) {
      throw this.toProviderError(error);
    } finally {
      unsubscribeDelta();
      unsubscribeUsage();
      await session.disconnect().catch(() => undefined);
    }
  }

  toProviderError(error: unknown): ProviderError {
    return mapError(error);
  }

  /** Stops every pooled runtime; called during server shutdown. */
  async shutdown(): Promise<void> {
    const entries = [...this.pool.values()];
    this.pool.clear();
    for (const entry of entries) {
      clearTimeout(entry.timer);
      await entry.client.stop().catch(() => undefined);
    }
  }

  private async createSession(
    request: ChatRequest,
    invocation: AdapterInvocation,
  ): Promise<CopilotSession> {
    try {
      const client = await this.getClient(this.token(invocation));
      return await client.createSession({
        model: request.model === "default" ? "auto" : request.model,
        streaming: true,
        ...(request.system
          ? { systemMessage: { mode: "append" as const, content: request.system } }
          : {}),
        // OneGo exposes a chat surface only; never let agent tools run here.
        onPermissionRequest: () => ({
          kind: "denied-no-approval-rule-and-could-not-request-from-user" as const,
        }),
      });
    } catch (error) {
      throw this.toProviderError(error);
    }
  }

  private async getClient(token: string): Promise<CopilotClient> {
    const key = createHash("sha256").update(token).digest("hex").slice(0, 24);
    const existing = this.pool.get(key);
    if (existing) {
      clearTimeout(existing.timer);
      existing.timer = this.scheduleIdleStop(key);
      return existing.client;
    }

    const client = new CopilotClient({
      gitHubToken: token,
      useLoggedInUser: false,
      logLevel: "error",
      ...(this.workingDirectory ? { workingDirectory: this.workingDirectory } : {}),
    });
    await client.start();
    this.pool.set(key, { client, timer: this.scheduleIdleStop(key) });
    return client;
  }

  private scheduleIdleStop(key: string): NodeJS.Timeout {
    const timer = setTimeout(() => {
      const entry = this.pool.get(key);
      if (!entry) return;
      this.pool.delete(key);
      void entry.client.stop().catch(() => undefined);
    }, this.idleShutdownMs);
    timer.unref();
    return timer;
  }

  private token(invocation: AdapterInvocation): string {
    if (invocation.credentials.method !== "cli_pat") {
      throw new ProviderError({
        kind: "auth",
        providerKind: "github",
        message:
          "GitHub Copilot requires a fine-grained GitHub token (cli_pat) credential",
      });
    }
    const token = invocation.credentials.token.trim();
    if (!token) {
      throw new ProviderError({
        kind: "auth",
        providerKind: "github",
        message: "GitHub token is empty",
      });
    }
    return token;
  }
}
