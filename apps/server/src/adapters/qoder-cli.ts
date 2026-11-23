import { spawn } from "node:child_process";
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

export const QODER_AUTO_MODEL = "auto";

export type QoderCliAdapterOptions = {
  /** CLI executable; defaults to ONEGO_QODER_CLI_PATH or "qoder" on PATH. */
  executable?: string;
  defaultModel?: string;
  extraModels?: string[];
  maxRuntimeMs?: number;
};

function textOfContent(content: string | ContentPart[]): string {
  if (typeof content === "string") return content;
  return content
    .map((part) => (part.type === "text" ? part.text : "[image omitted]"))
    .join("\n");
}

function buildPrompt(request: ChatRequest): string {
  const lines: string[] = [];
  if (request.system) {
    lines.push(`# System instructions\n${request.system}`);
  }
  for (const message of request.messages as ChatMessage[]) {
    lines.push(`## ${message.role.toUpperCase()}\n${textOfContent(message.content)}`);
  }
  lines.push(
    "## ASSISTANT",
    "Reply to the last user message using the context above. Output only the assistant reply.",
  );
  return lines.join("\n\n");
}

function inferStatusFromStderr(stderr: string): number | undefined {
  const lower = stderr.toLowerCase();
  if (/quota|usage limit|credit balance|billing|insufficient/.test(lower)) {
    return 429;
  }
  if (/rate limit|too many requests|\b429\b/.test(lower)) return 429;
  if (/unauthori[sz]ed|invalid.*(?:token|api key)|authentication failed|\b401\b/.test(lower)) {
    return 401;
  }
  if (/forbidden|permission denied|\b403\b/.test(lower)) return 403;
  if (/timed out|timeout|etimedout/.test(lower)) return 408;
  return undefined;
}

function cliFailure(stderr: string, exitCode: number | null): ProviderError {
  const message =
    stderr.trim() ||
    `Qoder CLI exited with code ${exitCode ?? "unknown"} and no error output`;
  // A 429 is inferred only when the text actually mentions quota/limits;
  // classifyProviderError still treats a plain 429 as retryable rate limiting.
  return classifyProviderError({
    providerKind: "qoder",
    status: inferStatusFromStderr(stderr),
    body: message,
  });
}

function mapUsage(usage: unknown): TokenUsage | undefined {
  if (!usage || typeof usage !== "object") return undefined;
  const record = usage as Record<string, unknown>;
  const input = record.input_tokens ?? record.inputTokens ?? record.prompt_tokens;
  const output =
    record.output_tokens ?? record.outputTokens ?? record.completion_tokens;
  const total = record.total_tokens ?? record.totalTokens;
  if (
    typeof input !== "number" &&
    typeof output !== "number" &&
    typeof total !== "number"
  ) {
    return undefined;
  }
  return {
    inputTokens: typeof input === "number" ? input : undefined,
    outputTokens: typeof output === "number" ? output : undefined,
    totalTokens: typeof total === "number" ? total : undefined,
  };
}

function extractText(payload: unknown): string | undefined {
  if (typeof payload === "string") return payload;
  if (Array.isArray(payload)) {
    const parts = payload
      .map((item) => extractText(item))
      .filter((value): value is string => Boolean(value));
    return parts.length ? parts.join("\n") : undefined;
  }
  if (!payload || typeof payload !== "object") return undefined;
  const record = payload as Record<string, unknown>;
  for (const key of ["result", "response", "text", "content", "output", "message"]) {
    if (key in record) {
      const extracted = extractText(record[key]);
      if (extracted) return extracted;
    }
  }
  if (Array.isArray(record.choices)) {
    const first = record.choices[0] as Record<string, unknown> | undefined;
    const message = first?.message as Record<string, unknown> | undefined;
    if (message) return extractText(message.content);
  }
  return undefined;
}

function parseJsonLineOutput(stdout: string): Record<string, unknown> | undefined {
  const lines = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      const parsed = JSON.parse(lines[index] as string) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Not every line is JSON (CLI progress logs); keep scanning.
    }
  }
  try {
    const parsed = JSON.parse(stdout) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

/**
 * Official Qoder CLI integration using headless (`--print`) mode.
 * Authentication uses QODER_PERSONAL_ACCESS_TOKEN, never an extracted session.
 */
export class QoderCliAdapter implements ProviderAdapter {
  readonly kind = "qoder" as const;
  readonly capabilities = {
    chat: true,
    streaming: true,
    toolCalling: false,
    vision: false,
    usageReporting: "none" as const,
    integration: "cli" as const,
  };
  readonly authMethods = ["cli_pat"] as const;

  private readonly executable: string;
  private readonly defaultModel: string;
  private readonly extraModels: string[];
  private readonly maxRuntimeMs: number;

  constructor(options: QoderCliAdapterOptions = {}) {
    this.executable =
      options.executable ??
      process.env.ONEGO_QODER_CLI_PATH ??
      "qoder";
    this.defaultModel =
      options.defaultModel ??
      process.env.ONEGO_QODER_DEFAULT_MODEL ??
      QODER_AUTO_MODEL;
    this.extraModels =
      options.extraModels ??
      (process.env.ONEGO_QODER_MODELS ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
    this.maxRuntimeMs = options.maxRuntimeMs ?? 10 * 60_000;
  }

  async validateConnection(
    invocation: AdapterInvocation,
  ): Promise<ConnectionValidation> {
    const startedAt = Date.now();
    const checkedAt = new Date().toISOString();
    try {
      const token = this.token(invocation);
      const result = await this.runCapture(["--version"], undefined, token, {
        timeoutMs: 20_000,
        signal: invocation.signal,
      });
      const latencyMs = Date.now() - startedAt;
      if (result.code !== 0) {
        return {
          ok: false,
          status: "error",
          message:
            result.stderr.trim() ||
            `Qoder CLI exited with code ${result.code ?? "unknown"}`,
          latencyMs,
          checkedAt,
        };
      }
      const version = result.stdout.trim().split(/\r?\n/)[0];
      return {
        ok: true,
        status: "connected",
        message: version ? `Qoder CLI ${version}` : "Qoder CLI reachable",
        latencyMs,
        checkedAt,
      };
    } catch (error) {
      return {
        ok: false,
        status: "error",
        message: this.describeLaunchError(error),
        latencyMs: Date.now() - startedAt,
        checkedAt,
      };
    }
  }

  async getAvailableModels(
    _invocation: AdapterInvocation,
  ): Promise<ProviderModelInfo[]> {
    const ids = [this.defaultModel, ...this.extraModels].filter(
      (value, index, all) => value && all.indexOf(value) === index,
    );
    return ids.map((id) => ({
      id,
      displayName: id === QODER_AUTO_MODEL ? "Qoder automatic model" : id,
      supportsTools: false,
      supportsVision: false,
    }));
  }

  async sendMessage(
    request: ChatRequest,
    invocation: AdapterInvocation,
  ): Promise<ChatResult> {
    const model = this.resolveModel(request.model);
    const args = ["-p", "--output-format", "json"];
    if (model !== QODER_AUTO_MODEL) args.push("-m", model);

    const result = await this.runCapture(
      args,
      buildPrompt(request),
      this.token(invocation),
      { timeoutMs: this.maxRuntimeMs, signal: invocation.signal },
    );
    if (result.code !== 0) throw cliFailure(result.stderr, result.code);

    const payload = parseJsonLineOutput(result.stdout);
    const text = payload ? extractText(payload) : result.stdout.trim();
    if (!text) {
      throw new ProviderError({
        kind: "unknown",
        providerKind: "qoder",
        message: "Qoder CLI returned no assistant text",
      });
    }
    const usage = payload ? mapUsage(payload.usage) : undefined;
    return {
      text,
      toolCalls: [],
      finishReason: "stop",
      usage,
    };
  }

  async *streamResponse(
    request: ChatRequest,
    invocation: AdapterInvocation,
  ): AsyncIterable<StreamEvent> {
    const model = this.resolveModel(request.model);
    const args = ["-p", "--output-format", "text"];
    if (model !== QODER_AUTO_MODEL) args.push("-m", model);

    const token = this.token(invocation);
    const startedAt = Date.now();
    const child = spawn(this.executable, args, {
      env: { ...process.env, QODER_PERSONAL_ACCESS_TOKEN: token },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      signal: invocation.signal,
    });

    let stderr = "";
    let text = "";
    let firstTokenLatencyMs: number | undefined;
    let timedOut = false;

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
      if (stderr.length > 16_384) stderr = stderr.slice(-16_384);
    });

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, this.maxRuntimeMs);

    const closed = new Promise<number | null>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code) => resolve(code));
    });

    child.stdin.on("error", () => {
      // The CLI may close stdin early; the exit status carries the real outcome.
    });
    child.stdin.end(buildPrompt(request));

    try {
      for await (const chunk of child.stdout) {
        const delta = chunk.toString();
        if (!delta) continue;
        if (firstTokenLatencyMs === undefined) {
          firstTokenLatencyMs = Date.now() - startedAt;
        }
        text += delta;
        yield { type: "text_delta", delta };
      }

      const code = await closed;
      if (timedOut) {
        throw new ProviderError({
          kind: "timeout",
          providerKind: "qoder",
          message: `Qoder CLI did not finish within ${Math.round(this.maxRuntimeMs / 1000)}s`,
          retryable: true,
        });
      }
      if (code !== 0) throw cliFailure(stderr, code);

      yield {
        type: "done",
        result: {
          text,
          toolCalls: [],
          finishReason: "stop",
          firstTokenLatencyMs,
        },
      };
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      throw this.toProviderError(error);
    } finally {
      clearTimeout(timeout);
      if (child.exitCode === null && !child.killed) child.kill();
    }
  }

  toProviderError(error: unknown): ProviderError {
    if (error instanceof ProviderError) return error;
    return classifyProviderError({ providerKind: "qoder", error });
  }

  private resolveModel(requested: string): string {
    return requested && requested !== "default" ? requested : this.defaultModel;
  }

  private token(invocation: AdapterInvocation): string {
    if (invocation.credentials.method !== "cli_pat") {
      throw new ProviderError({
        kind: "auth",
        providerKind: "qoder",
        message: "Qoder requires a personal access token (cli_pat) credential",
      });
    }
    const token = invocation.credentials.token.trim();
    if (!token) {
      throw new ProviderError({
        kind: "auth",
        providerKind: "qoder",
        message: "Qoder personal access token is empty",
      });
    }
    return token;
  }

  private describeLaunchError(error: unknown): string {
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    if (code === "ENOENT") {
      return `Qoder CLI executable "${this.executable}" was not found. Install the official Qoder CLI or set ONEGO_QODER_CLI_PATH.`;
    }
    return error instanceof Error ? error.message : "Qoder CLI could not be started";
  }

  private runCapture(
    args: string[],
    stdin: string | undefined,
    token: string,
    options: { timeoutMs: number; signal?: AbortSignal },
  ): Promise<{ code: number | null; stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.executable, args, {
        env: { ...process.env, QODER_PERSONAL_ACCESS_TOKEN: token },
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      });
      let stdout = "";
      let stderr = "";
      let settled = false;
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        stdout += chunk;
        if (stdout.length > 4_000_000) stdout = stdout.slice(-4_000_000);
      });
      child.stderr.on("data", (chunk: string) => {
        stderr += chunk;
        if (stderr.length > 65_536) stderr = stderr.slice(-65_536);
      });

      const timeout = setTimeout(() => {
        if (settled) return;
        child.kill();
        reject(
          new ProviderError({
            kind: "timeout",
            providerKind: "qoder",
            message: `Qoder CLI did not respond within ${Math.round(options.timeoutMs / 1000)}s`,
            retryable: true,
          }),
        );
      }, options.timeoutMs);

      const onAbort = () => {
        child.kill();
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          reject(
            new ProviderError({
              kind: "timeout",
              providerKind: "qoder",
              message: "Request cancelled",
            }),
          );
        }
      };
      options.signal?.addEventListener("abort", onAbort, { once: true });

      child.once("error", (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        options.signal?.removeEventListener("abort", onAbort);
        reject(error);
      });
      child.once("close", (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        options.signal?.removeEventListener("abort", onAbort);
        resolve({ code, stdout, stderr });
      });

      child.stdin.on("error", () => undefined);
      child.stdin.end(stdin ?? "");
    });
  }
}
