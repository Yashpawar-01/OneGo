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

type OpenAiChatResponse = {
  id?: string;
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: Array<{
        id?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};

type OpenAiStreamChunk = {
  id?: string;
  choices?: Array<{
    delta?: {
      content?: string | null;
      tool_calls?: Array<{
        index?: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
    finish_reason?: string | null;
  }>;
  usage?: OpenAiChatResponse["usage"];
};

export type OpenAiAdapterOptions = {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  /** Optional note shown in usage UI when no Admin key is configured. */
  hasAdminKey?: boolean;
};

function mapFinishReason(reason: string | null | undefined): FinishReason {
  switch (reason) {
    case "stop":
      return "stop";
    case "length":
      return "length";
    case "tool_calls":
    case "function_call":
      return "tool_use";
    case "content_filter":
      return "content_filter";
    default:
      return "unknown";
  }
}

function mapUsage(
  usage: OpenAiChatResponse["usage"] | undefined,
): TokenUsage | undefined {
  if (!usage) return undefined;
  return {
    inputTokens: usage.prompt_tokens,
    outputTokens: usage.completion_tokens,
    totalTokens: usage.total_tokens,
  };
}

function toMessages(request: ChatRequest): Array<Record<string, unknown>> {
  const messages: Array<Record<string, unknown>> = [];
  if (request.system) {
    messages.push({ role: "system", content: request.system });
  }
  for (const message of request.messages as ChatMessage[]) {
    messages.push({
      role: message.role,
      content: message.content,
      ...(message.toolCallId ? { tool_call_id: message.toolCallId } : {}),
      ...(message.name ? { name: message.name } : {}),
    });
  }
  return messages;
}

/** OpenAI Chat Completions adapter (official Platform API). */
export class OpenAiAdapter implements ProviderAdapter {
  readonly kind = "openai" as const;
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

  constructor(options: OpenAiAdapterOptions = {}) {
    this.baseUrl = (options.baseUrl ?? "https://api.openai.com/v1").replace(
      /\/$/,
      "",
    );
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async validateConnection(
    invocation: AdapterInvocation,
  ): Promise<ConnectionValidation> {
    const startedAt = Date.now();
    const response = await this.fetchImpl(`${this.baseUrl}/models`, {
      headers: this.headers(invocation),
      signal: invocation.signal,
    });
    const latencyMs = Date.now() - startedAt;
    if (!response.ok) {
      throw await this.httpError(response);
    }
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
    const response = await this.fetchImpl(`${this.baseUrl}/models`, {
      headers: this.headers(invocation),
      signal: invocation.signal,
    });
    if (!response.ok) throw await this.httpError(response);

    const body = (await response.json()) as {
      data?: Array<{ id?: string; owned_by?: string }>;
    };
    return (body.data ?? [])
      .filter((model): model is { id: string } => Boolean(model.id))
      .map((model) => ({
        id: model.id,
        displayName: model.id,
        supportsTools: true,
        supportsVision: false,
      }));
  }

  async sendMessage(
    request: ChatRequest,
    invocation: AdapterInvocation,
  ): Promise<ChatResult> {
    const response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: this.headers(invocation),
      signal: invocation.signal,
      body: JSON.stringify(this.payload(request, false)),
    });
    if (!response.ok) throw await this.httpError(response);

    const body = (await response.json()) as OpenAiChatResponse;
    const choice = body.choices?.[0];
    const toolCalls: ToolCall[] = (choice?.message?.tool_calls ?? []).map(
      (call, index) => ({
        id: call.id ?? `call_${index}`,
        name: call.function?.name ?? "",
        arguments: call.function?.arguments ?? "{}",
      }),
    );

    return {
      text: choice?.message?.content ?? "",
      toolCalls,
      finishReason: mapFinishReason(choice?.finish_reason),
      usage: mapUsage(body.usage),
      providerRequestId: body.id ?? response.headers.get("x-request-id") ?? undefined,
    };
  }

  async *streamResponse(
    request: ChatRequest,
    invocation: AdapterInvocation,
  ): AsyncIterable<StreamEvent> {
    const response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: this.headers(invocation),
      signal: invocation.signal,
      body: JSON.stringify(this.payload(request, true)),
    });
    if (!response.ok) throw await this.httpError(response);

    let text = "";
    let finishReason: FinishReason = "unknown";
    let usage: TokenUsage | undefined;
    let requestId = response.headers.get("x-request-id") ?? undefined;
    const toolCallParts = new Map<
      number,
      { id: string; name: string; arguments: string }
    >();
    const startedAt = Date.now();
    let firstTokenLatencyMs: number | undefined;

    for await (const message of readSse(response)) {
      if (message.data === "[DONE]") break;

      let chunk: OpenAiStreamChunk;
      try {
        chunk = JSON.parse(message.data) as OpenAiStreamChunk;
      } catch {
        continue;
      }

      requestId = chunk.id ?? requestId;
      if (chunk.usage) usage = mapUsage(chunk.usage);

      const choice = chunk.choices?.[0];
      if (!choice) continue;

      const delta = choice.delta?.content;
      if (delta) {
        if (firstTokenLatencyMs === undefined) {
          firstTokenLatencyMs = Date.now() - startedAt;
        }
        text += delta;
        yield { type: "text_delta", delta };
      }

      for (const part of choice.delta?.tool_calls ?? []) {
        const index = part.index ?? 0;
        const existing = toolCallParts.get(index) ?? {
          id: part.id ?? `call_${index}`,
          name: "",
          arguments: "",
        };
        if (part.id) existing.id = part.id;
        if (part.function?.name) existing.name += part.function.name;
        if (part.function?.arguments) {
          existing.arguments += part.function.arguments;
        }
        toolCallParts.set(index, existing);
      }

      if (choice.finish_reason) {
        finishReason = mapFinishReason(choice.finish_reason);
      }
    }

    const toolCalls: ToolCall[] = [...toolCallParts.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, call]) => ({
        id: call.id,
        name: call.name,
        arguments: call.arguments || "{}",
      }));

    for (const call of toolCalls) {
      yield { type: "tool_call", call };
    }
    if (usage) yield { type: "usage", usage };

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
    return classifyProviderError({
      providerKind: "openai",
      error,
    });
  }

  private headers(invocation: AdapterInvocation): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey(invocation)}`,
      "Content-Type": "application/json",
    };
  }

  private apiKey(invocation: AdapterInvocation): string {
    if (invocation.credentials.method !== "api_key") {
      throw new ProviderError({
        kind: "auth",
        message: "OpenAI requires an API key credential",
        providerKind: "openai",
      });
    }
    return invocation.credentials.apiKey;
  }

  private payload(request: ChatRequest, stream: boolean) {
    return {
      model: request.model,
      messages: toMessages(request),
      stream,
      ...(stream ? { stream_options: { include_usage: true } } : {}),
      ...(request.temperature !== undefined
        ? { temperature: request.temperature }
        : {}),
      ...(request.maxOutputTokens !== undefined
        ? { max_tokens: request.maxOutputTokens }
        : {}),
      ...(request.tools?.length
        ? {
            tools: request.tools.map((tool) => ({
              type: "function",
              function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.inputSchema,
              },
            })),
          }
        : {}),
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
      providerKind: "openai",
      status: response.status,
      headers: response.headers,
      body,
    });
  }
}
