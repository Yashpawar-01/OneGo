import type {
  ProviderErrorInfo,
  ProviderErrorKind,
  ProviderKind,
} from "@onego/shared";

export type ProviderErrorInit = {
  kind: ProviderErrorKind;
  message: string;
  providerKind?: ProviderKind;
  retryable?: boolean;
  retryAfterMs?: number;
  statusCode?: number;
  providerCode?: string;
  requestId?: string;
  cause?: unknown;
};

export class ProviderError extends Error {
  readonly kind: ProviderErrorKind;
  readonly providerKind?: ProviderKind;
  readonly retryable: boolean;
  readonly retryAfterMs?: number;
  readonly statusCode?: number;
  readonly providerCode?: string;
  readonly requestId?: string;

  constructor(init: ProviderErrorInit) {
    super(init.message, { cause: init.cause });
    this.name = "ProviderError";
    this.kind = init.kind;
    this.providerKind = init.providerKind;
    this.retryable = init.retryable ?? false;
    this.retryAfterMs = init.retryAfterMs;
    this.statusCode = init.statusCode;
    this.providerCode = init.providerCode;
    this.requestId = init.requestId;
  }

  toInfo(): ProviderErrorInfo {
    return {
      kind: this.kind,
      message: this.message,
      retryable: this.retryable,
      retryAfterMs: this.retryAfterMs,
      statusCode: this.statusCode,
      providerCode: this.providerCode,
      requestId: this.requestId,
    };
  }
}

export type HeaderSource =
  | Headers
  | Record<string, string | number | undefined>;

export type ClassifyInput = {
  providerKind?: ProviderKind;
  status?: number;
  headers?: HeaderSource;
  body?: unknown;
  error?: unknown;
  requestId?: string;
};

const QUOTA_PATTERNS = [
  /insufficient_quota/,
  /quota (?:has been )?(?:exceeded|exhausted)/,
  /exceeded your current quota/,
  /credit balance/,
  /insufficient (?:credits|funds|balance)/,
  /billing/,
  /monthly (?:limit|usage limit)/,
  /usage limit (?:reached|exceeded)/,
];

const CONTENT_POLICY_PATTERNS = [
  /content[_ ]policy/,
  /content[_ ]filter/,
  /safety (?:system|policy)/,
  /responsible ai/,
];

export function getHeader(
  headers: HeaderSource | undefined,
  name: string,
): string | undefined {
  if (!headers) return undefined;

  if (typeof Headers !== "undefined" && headers instanceof Headers) {
    return headers.get(name) ?? undefined;
  }

  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === target && value !== undefined) {
      return String(value);
    }
  }
  return undefined;
}

/** Parses `retry-after` as delta-seconds or an HTTP date into milliseconds. */
export function parseRetryAfterMs(
  headers: HeaderSource | undefined,
  now: number = Date.now(),
): number | undefined {
  const raw = getHeader(headers, "retry-after");
  if (!raw) return undefined;

  const seconds = Number(raw);
  if (Number.isFinite(seconds)) {
    return Math.max(0, Math.round(seconds * 1000));
  }

  const date = Date.parse(raw);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, date - now);
}

function extractErrorInfo(body: unknown): {
  message?: string;
  code?: string;
} {
  if (!body || typeof body !== "object") return {};

  const record = body as Record<string, unknown>;
  const nested =
    record.error && typeof record.error === "object"
      ? (record.error as Record<string, unknown>)
      : undefined;

  const messageCandidates = [nested?.message, record.message];
  const codeCandidates = [
    nested?.code,
    nested?.type,
    record.code,
    record.type,
  ];

  const message = messageCandidates.find(
    (value): value is string => typeof value === "string",
  );
  const code = codeCandidates.find(
    (value): value is string => typeof value === "string",
  );

  return { message, code };
}

function bodyMatches(body: unknown, patterns: RegExp[]): boolean {
  const { message, code } = extractErrorInfo(body);
  const haystack = `${code ?? ""} ${message ?? ""}`.toLowerCase();
  if (haystack.trim() && patterns.some((pattern) => pattern.test(haystack))) {
    return true;
  }
  if (typeof body === "string") {
    return patterns.some((pattern) => pattern.test(body.toLowerCase()));
  }
  return false;
}

/**
 * Maps provider/network failures onto the platform error taxonomy.
 * Quota exhaustion is deliberately separated from rate limiting: the fallback
 * engine must never retry an exhausted provider, but may retry a rate-limited one.
 */
export function classifyProviderError(input: ClassifyInput): ProviderError {
  const { providerKind, status, headers, body, error, requestId } = input;

  if (error instanceof ProviderError) return error;

  const base = { providerKind, statusCode: status, requestId };
  const parsed = extractErrorInfo(body);
  const retryAfterMs = parseRetryAfterMs(headers);
  const message =
    parsed.message ??
    (error instanceof Error ? error.message : undefined) ??
    `Provider request failed${status ? ` with status ${status}` : ""}`;

  if (error instanceof Error) {
    const name = error.name.toLowerCase();
    if (name === "aborterror" || name === "timeouterror") {
      return new ProviderError({
        ...base,
        kind: "timeout",
        message: "Provider request timed out",
        retryable: true,
        cause: error,
      });
    }
    if (name === "typeerror") {
      return new ProviderError({
        ...base,
        kind: "network",
        message,
        retryable: true,
        cause: error,
      });
    }
  }

  if (status === undefined) {
    return new ProviderError({
      ...base,
      kind: "unknown",
      message,
      retryable: false,
      cause: error,
    });
  }

  if (status === 401) {
    return new ProviderError({
      ...base,
      kind: "auth",
      message,
      providerCode: parsed.code,
      retryable: false,
    });
  }

  if (status === 403) {
    return new ProviderError({
      ...base,
      kind: "permission",
      message,
      providerCode: parsed.code,
      retryable: false,
    });
  }

  if (status === 429) {
    if (bodyMatches(body, QUOTA_PATTERNS)) {
      return new ProviderError({
        ...base,
        kind: "quota_exhausted",
        message,
        providerCode: parsed.code,
        // A hard quota never resets by retrying; the fallback engine switches accounts.
        retryable: false,
        retryAfterMs,
      });
    }
    return new ProviderError({
      ...base,
      kind: "rate_limited",
      message,
      providerCode: parsed.code,
      retryable: true,
      retryAfterMs,
    });
  }

  if (status === 408 || status === 504) {
    return new ProviderError({
      ...base,
      kind: "timeout",
      message,
      providerCode: parsed.code,
      retryable: true,
      retryAfterMs,
    });
  }

  if (status === 400 || status === 404 || status === 409 || status === 422) {
    const isPolicy = bodyMatches(body, CONTENT_POLICY_PATTERNS);
    return new ProviderError({
      ...base,
      kind: isPolicy ? "content_policy" : "invalid_request",
      message,
      providerCode: parsed.code,
      retryable: false,
    });
  }

  if (status >= 500) {
    return new ProviderError({
      ...base,
      kind: "server",
      message,
      providerCode: parsed.code,
      retryable: true,
      retryAfterMs,
    });
  }

  return new ProviderError({
    ...base,
    kind: "unknown",
    message,
    providerCode: parsed.code,
    retryable: false,
  });
}
