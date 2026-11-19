import type { ProviderErrorInfo } from "./provider.js";

export type ChatRole = "system" | "user" | "assistant" | "tool";

export type TextPart = { type: "text"; text: string };
export type ImagePart = { type: "image"; mediaType: string; dataBase64: string };
export type ContentPart = TextPart | ImagePart;

export type ChatMessage = {
  role: ChatRole;
  content: string | ContentPart[];
  name?: string;
  toolCallId?: string;
};

export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export type ToolCall = {
  id: string;
  name: string;
  /** JSON-encoded arguments as produced by the provider. */
  arguments: string;
};

export type FinishReason =
  | "stop"
  | "length"
  | "tool_use"
  | "content_filter"
  | "error"
  | "unknown";

export type TokenUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

export type ChatRequest = {
  model: string;
  messages: ChatMessage[];
  system?: string;
  tools?: ToolDefinition[];
  temperature?: number;
  maxOutputTokens?: number;
  metadata?: Record<string, string>;
};

export type ChatResult = {
  text: string;
  toolCalls: ToolCall[];
  finishReason: FinishReason;
  usage?: TokenUsage;
  providerRequestId?: string;
  /** ms from request start to first streamed token, when available. */
  firstTokenLatencyMs?: number;
};

export type StreamEvent =
  | { type: "text_delta"; delta: string }
  | { type: "tool_call"; call: ToolCall }
  | { type: "usage"; usage: TokenUsage }
  | { type: "done"; result: ChatResult }
  | { type: "error"; error: ProviderErrorInfo };
