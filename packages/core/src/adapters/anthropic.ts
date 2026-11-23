import type {
  ChatMessage,
  ChatRequest,
  ChatResult,
  ConnectionValidation,
  FinishReason,
  ProviderModelInfo,
  StreamEvent,
  TokenUsage,
  ToolCall,
} from "@onego/shared";
import { classifyProviderError, ProviderError } from "../errors/provider-error.js";
import type { AdapterInvocation, ProviderAdapter } from "../providers/adapter.js";
import { readSse } from "./sse.js";

const ANTHROPIC_VERSION = "2023-06-01";

type AnthropicContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: string };

type AnthropicResponse = {
  id?: string;
  content?: AnthropicContentBlock[];
  stop_reason?: string | null;
  usage?: { input_tokens?: number; output_tokens?: number };
};

export type AnthropicAdapterOptions = {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
};

function mapFinishReason(reason: string | null | undefined): FinishReason {
  switch (reason) {
    case "end_turn":
    case "stop_sequence":
      return "stop";
    case "max_tokens":
      return "length";
    case "tool_use":
      return "tool_use";
    default:
      return "unknown";
  }
}

function mapErrorStatus(errorType: string | undefined): number {
  switch (errorType) {
    case "rate_limit_error":
      return 429;
    case "overloaded_error":
      return 529;
    case "authentication_error":
      return 401;
    case "permission_error":
      return 403;
    default:
      return 400;
  }
}

/** Anthropic Messages API adapter. */
export class AnthropicAdapter implements ProviderAdapter {
  readonly kind = "anthropic" as const;
  readonly capabilities = {
    chat: true,
    streaming: true,
    toolCalling: true,
    vision: true,
    usageReporting: "rate_limits_only" as const,
    integration: "http" as const,
  };
  readonly authMethods = ["api_key"] as const;

  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: AnthropicAdapterOptions = {}) {
    this.baseUrl = (options.baseUrl ?? "https://api.anthropic.com/v1").replace(
      /\/$/,
      "",
    );
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async validateConnection(
    invocation: AdapterInvocation,
  ): Promise<ConnectionValidation> {
    const startedAt = Date.now();
    const response = await this.fetchImpl(`${this.baseUrl}/models?limit=1`, {
      headers: this.headers(invocation),
      signal: invocation.signal,
    });
    const latencyMs = Date.now() - startedAt;
    if (!response.ok) throw await this.httpError(response);
    return {
      ok: true,
      status: "connected",
      latencyMs,
      checkedAt: new Date().toISOString(),
    };
  }

  async getAvailableModels(
    invocation: AdapterInvocation,
  ): Promise<ProviderModelInfo[]> {
    const response = await this.fetchImpl(`${this.baseUrl}/models?limit=100`, {
      headers: this.headers(invocation),
      signal: invocation.signal,
    });
    if (!response.ok) throw await this.httpError(response);

    const body = (await response.json()) as {
      data?: Array<{ id?: string; display_name?: string }>;
    };
    return (body.data ?? [])
      .filter((model): model is { id: string; display_name?: string } =>
        Boolean(model.id),
      )
      .map((model) => ({
        id: model.id,
        displayName: model.display_name ?? model.id,
        supportsTools: true,
        supportsVision: false,
      }));
  }

  async sendMessage(
    request: ChatRequest,
    invocation: AdapterInvocation,
  ): Promise<ChatResult> {
    const response = await this.fetchImpl(`${this.baseUrl}/messages`, {
      method: "POST",
      headers: this.headers(invocation),
      signal: invocation.signal,
      body: JSON.stringify(this.payload(request, false)),
    });
    if (!response.ok) throw await this.httpError(response);

    const body = (await response.json()) as AnthropicResponse;
    let text = "";
    const toolCalls: ToolCall[] = [];
    for (const block of body.content ?? []) {
      if (block.type === "text" && "text" in block) {
        text += block.text;
      } else if (block.type === "tool_use" && "name" in block && "id" in block) {
        toolCalls.push({
          id: block.id,
          name: block.name,
          arguments: JSON.stringify(block.input ?? {}),
        });
      }
    }

    return {
      text,
      toolCalls,
      finishReason: mapFinishReason(body.stop_reason),
      usage: this.mapUsage(body.usage),
      providerRequestId:
        body.id ?? response.headers.get("request-id") ?? undefined,
    };
  }

  async *streamResponse(
    request: ChatRequest,
    invocation: AdapterInvocation,
  ): AsyncIterable<StreamEvent> {
    const response = await this.fetchImpl(`${this.baseUrl}/messages`, {
      method: "POST",
      headers: this.headers(invocation),
      signal: invocation.signal,
      body: JSON.stringify(this.payload(request, true)),
    });
    if (!response.ok) throw await this.httpError(response);

    let text = "";
    let usage: TokenUsage = {};
    let finishReason: FinishReason = "unknown";
    let requestId = response.headers.get("request-id") ?? undefined;
    let firstTokenLatencyMs: number | undefined;
    const startedAt = Date.now();
    const toolCalls: ToolCall[] = [];
    const openToolBlocks = new Map<
      number,
      { id: string; name: string; arguments: string }
    >();

    for await (const message of readSse(response)) {
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(message.data) as Record<string, unknown>;
      } catch {
        continue;
      }

      const type = (message.event ?? data.type) as string | undefined;
      if (type === "message_start") {
        const start = data.message as
          | { id?: string; usage?: AnthropicResponse["usage"] }
          | undefined;
        requestId = start?.id ?? requestId;
        const inputTokens = start?.usage?.input_tokens;
        if (inputTokens !== undefined) usage.inputTokens = inputTokens;
      } else if (type === "content_block_start") {
        const block = data.content_block as
          | { type?: string; id?: string; name?: string }
          | undefined;
        const index = Number(data.index ?? 0);
        if (block?.type === "tool_use") {
          openToolBlocks.set(index, {
            id: block.id ?? `tool_${index}`,
            name: block.name ?? "",
            arguments: "",
          });
        }
      } else if (type === "content_block_delta") {
        const delta = data.delta as
          | { type?: string; text?: string; partial_json?: string }
          | undefined;
        if (delta?.type === "text_delta" && delta.text) {
          if (firstTokenLatencyMs === undefined) {
            firstTokenLatencyMs = Date.now() - startedAt;
          }
          text += delta.text;
          yield { type: "text_delta", delta: delta.text };
        } else if (delta?.type === "input_json_delta" && delta.partial_json) {
          const index = Number(data.index ?? 0);
          const block = openToolBlocks.get(index);
          if (block) block.arguments += delta.partial_json;
        }
      } else if (type === "content_block_stop") {
        const index = Number(data.index ?? 0);
        const block = openToolBlocks.get(index);
        if (block) {
          const call: ToolCall = {
            id: block.id,
            name: block.name,
            arguments: block.arguments || "{}",
          };
          toolCalls.push(call);
          yield { type: "tool_call", call };
          openToolBlocks.delete(index);
        }
      } else if (type === "message_delta") {
        const delta = data.delta as { stop_reason?: string } | undefined;
        if (delta?.stop_reason) finishReason = mapFinishReason(delta.stop_reason);
        const outTokens = (data.usage as { output_tokens?: number } | undefined)
          ?.output_tokens;
        if (outTokens !== undefined) usage.outputTokens = outTokens;
      } else if (type === "error") {
        const error = data.error as
          | { type?: string; message?: string }
          | undefined;
        throw classifyProviderError({
          providerKind: "anthropic",
          status: mapErrorStatus(error?.type),
          body: data,
        });
      }
    }

    if (usage.inputTokens !== undefined || usage.outputTokens !== undefined) {
      yield { type: "usage", usage };
    }

    yield {
      type: "done",
      result: {
        text,
        toolCalls,
        finishReason,
        usage,
        providerRequestId: requestId,
        firstTokenLatencyMs,
      },
    };
  }

  toProviderError(error: unknown): ProviderError {
    if (error instanceof ProviderError) return error;
    return classifyProviderError({ providerKind: "anthropic", error });
  }

  private headers(invocation: AdapterInvocation): Record<string, string> {
    return {
      "x-api-key": this.apiKey(invocation),
      "anthropic-version": ANTHROPIC_VERSION,
      "Content-Type": "application/json",
    };
  }

  private apiKey(invocation: AdapterInvocation): string {
    if (invocation.credentials.method !== "api_key") {
      throw new ProviderError({
        kind: "auth",
        message: "Anthropic requires an API key credential",
        providerKind: "anthropic",
      });
    }
    return invocation.credentials.apiKey;
  }

  private payload(request: ChatRequest, stream: boolean) {
    const systemParts: string[] = [];
    if (request.system) systemParts.push(request.system);

    const messages: Array<{
      role: "user" | "assistant";
      content: string | Array<Record<string, unknown>>;
    }> = [];

    for (const message of request.messages as ChatMessage[]) {
      if (message.role === "system") {
        systemParts.push(
          typeof message.content === "string"
            ? message.content
            : message.content.map((part) => (part.type === "text" ? part.text : "")).join("\n"),
        );
        continue;
      }

      const role: "user" | "assistant" =
        message.role === "assistant" ? "assistant" : "user";

      if (typeof message.content === "string") {
        messages.push({ role, content: message.content });
      } else {
        messages.push({
          role,
          content: message.content.map((part) =>
            part.type === "text"
              ? { type: "text", text: part.text }
              : {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: part.mediaType,
                    data: part.dataBase64,
                  },
                },
          ),
        });
      }
    }

    return {
      model: request.model,
      max_tokens: request.maxOutputTokens ?? 4096,
      messages,
      ...(systemParts.length ? { system: systemParts.join("\n\n") } : {}),
      stream,
      ...(request.temperature !== undefined
        ? { temperature: request.temperature }
        : {}),
      ...(request.tools?.length
        ? {
            tools: request.tools.map((tool) => ({
              name: tool.name,
              description: tool.description,
              input_schema: tool.inputSchema,
            })),
          }
        : {}),
    };
  }

  private mapUsage(
    usage: AnthropicResponse["usage"] | undefined,
  ): TokenUsage | undefined {
    if (!usage) return undefined;
    const input = usage.input_tokens;
    const output = usage.output_tokens;
    return {
      inputTokens: input,
      outputTokens: output,
      totalTokens:
        input !== undefined && output !== undefined ? input + output : undefined,
    };
  }

  private async httpError(response: Response): Promise<ProviderError> {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = await response.text().catch(() => undefined);
    }
    return classifyProviderError({
      providerKind: "anthropic",
      status: response.status,
      headers: response.headers,
      body,
    });
  }
}
