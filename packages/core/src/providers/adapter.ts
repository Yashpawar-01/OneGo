import type {
  AuthMethod,
  ChatRequest,
  ChatResult,
  ConnectionValidation,
  ProviderCapabilities,
  ProviderCredentials,
  ProviderKind,
  ProviderModelInfo,
  ProviderUsageSnapshot,
  StreamEvent,
} from "@onego/shared";
import type { ProviderError } from "../errors/provider-error.js";

export type AdapterInvocation = {
  requestId: string;
  accountId: string;
  /** Decrypted for the duration of the call; adapters must never persist it. */
  credentials: ProviderCredentials;
  signal?: AbortSignal;
};

/**
 * Standard contract every provider integration implements.
 * Optional operations must be absent when capabilities say they are unsupported,
 * rather than throwing.
 */
export interface ProviderAdapter {
  readonly kind: ProviderKind;
  readonly capabilities: ProviderCapabilities;
  readonly authMethods: readonly AuthMethod[];

  validateConnection(invocation: AdapterInvocation): Promise<ConnectionValidation>;

  getAvailableModels(invocation: AdapterInvocation): Promise<ProviderModelInfo[]>;

  getUsage?(invocation: AdapterInvocation): Promise<ProviderUsageSnapshot>;

  sendMessage(
    request: ChatRequest,
    invocation: AdapterInvocation,
  ): Promise<ChatResult>;

  streamResponse?(
    request: ChatRequest,
    invocation: AdapterInvocation,
  ): AsyncIterable<StreamEvent>;

  toProviderError(error: unknown): ProviderError;
}
