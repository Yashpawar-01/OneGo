import type {
  ChatRequest,
  ChatResult,
  FinishReason,
  ProviderErrorInfo,
  ProviderKind,
  StreamEvent,
  TokenUsage,
  ToolCall,
} from "@onego/shared";
import { ProviderError } from "../errors/provider-error.js";
import type { AdapterInvocation, ProviderAdapter } from "../providers/adapter.js";

export type AttemptTarget = {
  accountId: string;
  /** Human-facing name, e.g. "Claude (work)". */
  label?: string;
  providerKind: ProviderKind;
  modelId: string;
  adapter: ProviderAdapter;
  invocation: AdapterInvocation;
};

export type FallbackReason =
  | "quota_exhausted"
  | "rate_limited"
  | "auth_error"
  | "provider_error";

export type RunnerEvent =
  | {
      type: "attempt_started";
      attempt: number;
      accountId: string;
      providerKind: ProviderKind;
      modelId: string;
    }
  | { type: "text_delta"; delta: string }
  | { type: "tool_call"; call: ToolCall }
  | { type: "usage"; usage: TokenUsage }
  | {
      type: "fallback";
      reason: FallbackReason;
      fromAccountId: string;
      fromProviderKind: ProviderKind;
      toAccountId: string;
      toProviderKind: ProviderKind;
      message: string;
    }
  | {
      type: "done";
      result: ChatResult;
      accountId: string;
      providerKind: ProviderKind;
      modelId: string;
      attempts: number;
    }
  | {
      type: "failed";
      error: ProviderErrorInfo;
      attempts: number;
      /** True when some output was already streamed and must not be replayed. */
      preservePartial: boolean;
    };

export type RunnerOptions = {
  /** Upper bound on total provider calls, including retries. */
  maxAttempts?: number;
  /** Retries for transient failures (timeout/network/server) per provider. */
  maxRetriesPerTarget?: number;
  /** Rate-limit waits longer than this switch providers instead of blocking. */
  maxRateLimitWaitMs?: number;
  wait?: (ms: number, signal?: AbortSignal) => Promise<void>;
  onTargetError?: (target: AttemptTarget, error: ProviderError) => void;
  onTargetSuccess?: (target: AttemptTarget) => void;
  signal?: AbortSignal;
};

const DEFAULT_WAIT = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("aborted"));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error("aborted"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });

function fallbackReason(error: ProviderError): FallbackReason {
  switch (error.kind) {
    case "quota_exhausted":
      return "quota_exhausted";
    case "rate_limited":
      return "rate_limited";
    case "auth":
    case "permission":
      return "auth_error";
    default:
      return "provider_error";
  }
}

function providerName(target: AttemptTarget): string {
  return target.label ?? target.providerKind;
}

function fallbackMessage(
  from: AttemptTarget,
  to: AttemptTarget,
  reason: FallbackReason,
): string {
  const human = reason.replaceAll("_", " ");
  return `${providerName(from)} is unavailable (${human}). Switching to ${providerName(to)}. Your conversation and project context have been preserved.`;
}

function isAbort(error: unknown, signal?: AbortSignal): boolean {
  return (
    signal?.aborted === true ||
    (error instanceof Error && error.name === "AbortError")
  );
}

export function failedEvent(
  error: ProviderErrorInfo,
  attempts: number,
  preservePartial = false,
): RunnerEvent {
  return { type: "failed", error, attempts, preservePartial };
}

async function* singleProviderStream(
  target: AttemptTarget,
  request: ChatRequest,
  signal?: AbortSignal,
): AsyncIterable<StreamEvent> {
  const providerRequest = { ...request, model: target.modelId };
  const invocation = { ...target.invocation, signal };

  if (target.adapter.streamResponse && target.adapter.capabilities.streaming) {
    yield* target.adapter.streamResponse(providerRequest, invocation);
    return;
  }

  const result = await target.adapter.sendMessage(providerRequest, invocation);
  if (result.text) {
    yield { type: "text_delta", delta: result.text };
  }
  for (const call of result.toolCalls) {
    yield { type: "tool_call", call };
  }
  if (result.usage) {
    yield { type: "usage", usage: result.usage };
  }
  yield { type: "done", result };
}

/**
 * Executes a chat request against ordered provider targets with automatic
 * fallback. Hard quota errors are never retried; after any streamed output a
 * failure stops the run to avoid duplicate content and double billing.
 */
export class FallbackRunner {
  async *stream(
    request: ChatRequest,
    targets: AttemptTarget[],
    options: RunnerOptions = {},
  ): AsyncIterable<RunnerEvent> {
    const wait = options.wait ?? DEFAULT_WAIT;
    const maxRetries = options.maxRetriesPerTarget ?? 1;
    const maxAttempts = Math.max(
      1,
      options.maxAttempts ?? targets.length * (maxRetries + 1),
    );
    const maxWait = options.maxRateLimitWaitMs ?? 20_000;

    if (targets.length === 0) {
      yield failedEvent(
        {
          kind: "auth",
          message: "No provider accounts are available for this request.",
          retryable: false,
        },
        0,
      );
      return;
    }

    let attempts = 0;
    let previous: AttemptTarget | undefined;
    let lastError: ProviderError | undefined;

    for (let index = 0; index < targets.length; index += 1) {
      const target = targets[index] as AttemptTarget;

      if (previous && lastError) {
        const reason = fallbackReason(lastError);
        yield {
          type: "fallback",
          reason,
          fromAccountId: previous.accountId,
          fromProviderKind: previous.providerKind,
          toAccountId: target.accountId,
          toProviderKind: target.providerKind,
          message: fallbackMessage(previous, target, reason),
        };
      }

      let retries = 0;

      while (true) {
        if (attempts >= maxAttempts) {
          yield failedEvent(
            lastError?.toInfo() ?? {
              kind: "unknown",
              message: "Provider attempt budget exhausted.",
              retryable: false,
            },
            attempts,
          );
          return;
        }

        attempts += 1;
        yield {
          type: "attempt_started",
          attempt: attempts,
          accountId: target.accountId,
          providerKind: target.providerKind,
          modelId: target.modelId,
        };

        const startedAt = Date.now();
        const acc = {
          text: "",
          toolCalls: [] as ToolCall[],
          usage: undefined as TokenUsage | undefined,
          finishReason: "unknown" as FinishReason,
          providerRequestId: undefined as string | undefined,
          firstTokenLatencyMs: undefined as number | undefined,
        };
        let sawOutput = false;
        let streamedDone: ChatResult | undefined;

        try {
          for await (const event of singleProviderStream(
            target,
            request,
            options.signal,
          )) {
            if (event.type === "text_delta") {
              if (!sawOutput && acc.firstTokenLatencyMs === undefined) {
                acc.firstTokenLatencyMs = Date.now() - startedAt;
              }
              sawOutput = true;
              acc.text += event.delta;
              yield event;
            } else if (event.type === "tool_call") {
              sawOutput = true;
              acc.toolCalls.push(event.call);
              yield event;
            } else if (event.type === "usage") {
              acc.usage = { ...acc.usage, ...event.usage };
              yield event;
            } else if (event.type === "done") {
              streamedDone = event.result;
            } else if (event.type === "error") {
              throw new ProviderError({
                kind: event.error.kind,
                message: event.error.message,
                retryable: event.error.retryable,
                retryAfterMs: event.error.retryAfterMs,
                statusCode: event.error.statusCode,
                providerKind: target.providerKind,
              });
            }
          }

          const result = streamedDone ?? {
            text: acc.text,
            toolCalls: acc.toolCalls,
            finishReason: "stop" as FinishReason,
            usage: acc.usage,
            providerRequestId: acc.providerRequestId,
            firstTokenLatencyMs:
              acc.firstTokenLatencyMs ?? Date.now() - startedAt,
          };

          options.onTargetSuccess?.(target);
          yield {
            type: "done",
            result: {
              ...result,
              text: result.text || acc.text,
              toolCalls: result.toolCalls.length
                ? result.toolCalls
                : acc.toolCalls,
              usage: result.usage ?? acc.usage,
            },
            accountId: target.accountId,
            providerKind: target.providerKind,
            modelId: target.modelId,
            attempts,
          };
          return;
        } catch (rawError) {
          if (isAbort(rawError, options.signal)) {
            yield failedEvent(
              {
                kind: "timeout",
                message: "Request cancelled.",
                retryable: false,
              },
              attempts,
              sawOutput,
            );
            return;
          }

          const error = target.adapter.toProviderError(rawError);
          lastError = error;
          options.onTargetError?.(target, error);

          if (sawOutput) {
            yield failedEvent(error.toInfo(), attempts, true);
            return;
          }

          const rateLimitedWithinBudget =
            error.kind === "rate_limited" &&
            error.retryAfterMs !== undefined &&
            error.retryAfterMs <= maxWait &&
            retries < maxRetries;

          if (rateLimitedWithinBudget) {
            retries += 1;
            try {
              await wait(error.retryAfterMs as number, options.signal);
            } catch {
              yield failedEvent(
                {
                  kind: "timeout",
                  message: "Request cancelled.",
                  retryable: false,
                },
                attempts,
              );
              return;
            }
            continue;
          }

          const transient =
            error.kind === "timeout" ||
            error.kind === "network" ||
            error.kind === "server";
          if (transient && retries < maxRetries) {
            retries += 1;
            continue;
          }

          break;
        }
      }

      previous = target;
    }

    yield failedEvent(
      lastError?.toInfo() ?? {
        kind: "unknown",
        message: "All providers failed.",
        retryable: false,
      },
      attempts,
    );
  }
}
