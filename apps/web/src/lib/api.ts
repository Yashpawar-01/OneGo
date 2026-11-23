const TOKEN_KEY = "onego.token";

export function getToken(): string | null {
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  window.localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(path, { ...options, headers });
  if (response.status === 401) {
    clearToken();
    window.dispatchEvent(new Event("onego:unauthorized"));
  }
  if (!response.ok) {
    let code = "request_failed";
    let message = `Request failed with status ${response.status}`;
    try {
      const payload = (await response.json()) as {
        error?: { code?: string; message?: string };
      };
      if (payload.error?.code) code = payload.error.code;
      if (payload.error?.message) message = payload.error.message;
    } catch {
      // Non-JSON error responses keep the generic message.
    }
    throw new ApiError(response.status, code, message);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export type User = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  createdAt: string;
};

export type Account = {
  id: string;
  label: string;
  providerKey: string;
  providerKind: string;
  providerName: string;
  authMethod: string;
  status: "connected" | "error" | "expired" | "disabled";
  statusMessage: string | null;
  priority: number;
  enabled: boolean;
  credentialHint: string | null;
  defaultModel: string | null;
  lastValidatedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
};

export type ProviderModel = {
  id: string;
  displayName: string;
  contextWindow?: number;
  maxOutputTokens?: number;
  supportsTools: boolean;
  supportsVision: boolean;
  inputCostPerMTok?: number;
  outputCostPerMTok?: number;
};

export type ProviderCapabilities = {
  chat: boolean;
  streaming: boolean;
  toolCalling: boolean;
  vision: boolean;
  usageReporting: "exact" | "rate_limits_only" | "none";
  integration: "http" | "sdk" | "cli";
};

export type Provider = {
  id: string;
  key: string;
  name: string;
  kind: string;
  authMethods: string[];
  docsUrl: string | null;
  capabilities: ProviderCapabilities;
  models: ProviderModel[];
  accounts: Account[];
};

export type Conversation = {
  id: string;
  title: string;
  status: "active" | "archived";
  routingMode: "manual" | "automatic" | "intelligent";
  activeAccountId: string | null;
  projectId: string | null;
  projectName: string | null;
  version: number;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
  messageCount?: number;
};

export type ChatMessage = {
  id: string;
  sequence: number;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  providerAccountId: string | null;
  modelId: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

export type SwitchRecord = {
  id: string;
  reason: string;
  detail: string | null;
  from: { label: string; provider: string } | null;
  to: { label: string; provider: string } | null;
  createdAt: string;
};

export type ConversationDetail = {
  conversation: Conversation;
  messages: ChatMessage[];
  switches: SwitchRecord[];
  contextSnapshot: {
    version: number;
    tokenCount: number | null;
    trigger: string;
    createdAt: string;
  } | null;
};

export type Overview = {
  counts: {
    accounts: number;
    connectedAccounts: number;
    errorAccounts: number;
    expiredAccounts: number;
    disabledAccounts: number;
    conversations: number;
    projects: number;
    messages: number;
    providerSwitches: number;
  };
  usage7d: {
    requests: number;
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd: number | null;
  };
  providers: Array<{
    accountId: string;
    providerKind: string;
    providerName: string;
    label: string;
    status: string;
    statusMessage: string | null;
    enabled: boolean;
    priority: number;
    lastUsedAt: string | null;
    coolingDownUntil: string | null;
  }>;
  recentConversations: Array<{
    id: string;
    title: string;
    projectName: string | null;
    updatedAt: string;
    lastMessageAt: string | null;
  }>;
  recentSwitches: Array<{
    id: string;
    conversationId: string;
    conversationTitle: string;
    reason: string;
    detail: string | null;
    from: string;
    to: string;
    createdAt: string;
  }>;
  onboarding: {
    hasProviderAccounts: boolean;
    hasSyncedModels: boolean;
    hasConversations: boolean;
  };
};

export type UsageSummary = {
  range: { days: number; since: string };
  totals: {
    requests: number;
    success: number;
    errors: number;
    successRate: number | null;
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd: number | null;
    sources: Record<string, number>;
  };
  byDay: Array<{
    day: string;
    requests: number;
    errors: number;
    inputTokens: number;
    outputTokens: number;
    costUsd: number | null;
  }>;
  byProvider: Array<{
    providerKind: string;
    name: string;
    requests: number;
    errors: number;
    inputTokens: number;
    outputTokens: number;
    costUsd: number | null;
  }>;
  byModel: Array<{
    modelId: string;
    requests: number;
    inputTokens: number;
    outputTokens: number;
    costUsd: number | null;
  }>;
  byAccount: Array<{
    accountId: string;
    label: string;
    provider: string;
    requests: number;
    errors: number;
    inputTokens: number;
    outputTokens: number;
    costUsd: number | null;
  }>;
  notes: string[];
};

export type UsageSnapshot = {
  providerKind: string;
  accountId: string;
  reporting: string;
  source: string;
  quota?: { exhausted: boolean; resetAt?: string; detail?: string };
  rateLimit?: {
    limited: boolean;
    retryAfterMs?: number;
    resetAt?: string;
    scope?: string;
  };
  tokens?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
  observedAt: string;
  note?: string;
};

export type UsageAccounts = {
  accounts: Array<{
    account: Account;
    usage: UsageSnapshot;
    last7Days: {
      requests: number;
      inputTokens: number;
      outputTokens: number;
      estimatedCostUsd: number | null;
    };
  }>;
};

export type Project = {
  id: string;
  name: string;
  description: string | null;
  rootPath: string | null;
  gitRemoteUrl: string | null;
  defaultBranch: string | null;
  createdAt: string;
  updatedAt: string;
  counts: { conversations: number; memories: number; tasks: number };
};

export type Memory = {
  id: string;
  key: string;
  value: string;
  category: string;
  source: string;
  pinned: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type Task = {
  id: string;
  title: string;
  detail: string | null;
  status: string;
  conversationId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProjectDetail = {
  project: Project;
  repositories: Array<{
    id: string;
    name: string;
    path: string;
    remoteUrl: string | null;
    branch: string | null;
    indexStatus: string;
    lastIndexedAt: string | null;
  }>;
  tasks: Task[];
  memories: Memory[];
};

export type RoutingRule = {
  id: string;
  name: string;
  enabled: boolean;
  mode: string;
  priority: number;
  conditions: Record<string, unknown>;
  targetProviderKind: string | null;
  targetModelId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RoutingPreview = {
  classification: {
    type: string;
    confidence: number;
    signals?: string[];
  };
  recommendations: Array<{
    providerKind: string | null;
    providerName: string | null;
    modelId: string;
    displayName: string;
    score: number;
    reasons: string[];
  }>;
};

export type ChatStreamEvent =
  | { type: "user_message"; id: string; sequence: number; createdAt: string }
  | {
      type: "meta";
      conversationId: string;
      routingMode: string;
      classification?: { type: string; confidence: number; signals?: string[] };
      routingRule?: { id: string; name: string };
      context: {
        includedMessages: number;
        omittedMessages: number;
        tokenEstimate: number;
        maxTokens: number;
      };
    }
  | {
      type: "attempt_started";
      attempt: number;
      accountId: string;
      providerKind: string;
      modelId: string;
      label?: string;
    }
  | { type: "delta"; delta: string }
  | {
      type: "usage";
      usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
    }
  | {
      type: "fallback";
      reason: string;
      fromAccountId: string;
      toAccountId: string;
      message: string;
    }
  | {
      type: "done";
      messageId: string;
      accountId: string;
      providerKind: string;
      modelId: string;
      usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
      attempts: number;
      context: {
        includedMessages: number;
        omittedMessages: number;
        tokenEstimate: number;
        maxTokens: number;
      };
    }
  | {
      type: "error";
      error: { kind: string; message: string; retryable: boolean };
      partial: boolean;
      text?: string;
    };

export async function streamChat(
  conversationId: string,
  payload: {
    content: string;
    accountId?: string | null;
    modelId?: string | null;
    routingMode?: string | null;
  },
  onEvent: (event: ChatStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const token = getToken();
  const response = await fetch(`/api/conversations/${conversationId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
    signal,
  });

  if (!response.ok) {
    let message = `Chat request failed with status ${response.status}`;
    let code = "chat_failed";
    try {
      const body = (await response.json()) as {
        error?: { message?: string; code?: string };
      };
      if (body.error?.message) message = body.error.message;
      if (body.error?.code) code = body.error.code;
    } catch {
      // Keep the generic message.
    }
    throw new ApiError(response.status, code, message);
  }
  if (!response.body) throw new ApiError(500, "no_stream", "The server returned no stream");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const handleBlock = (block: string) => {
    let eventName = "message";
    const dataLines: string[] = [];
    for (const line of block.split("\n")) {
      if (line.startsWith("event: ")) eventName = line.slice(7).trim();
      else if (line.startsWith("data: ")) dataLines.push(line.slice(6));
    }
    if (eventName === "end" || dataLines.length === 0) return;
    try {
      const parsed = JSON.parse(dataLines.join("\n")) as ChatStreamEvent;
      onEvent(parsed);
    } catch {
      // Ignore malformed frames; heartbeats are comments and skipped.
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary = buffer.indexOf("\n\n");
    while (boundary >= 0) {
      handleBlock(buffer.slice(0, boundary));
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf("\n\n");
    }
  }
  if (buffer.trim()) handleBlock(buffer);
}

export const api = {
  auth: {
    register: (body: { email: string; password: string; name?: string }) =>
      apiFetch<{ user: User; token: string }>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    login: (body: { email: string; password: string }) =>
      apiFetch<{ user: User; token: string }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    me: () => apiFetch<{ user: User }>("/api/auth/me"),
  },
  overview: () => apiFetch<Overview>("/api/overview"),
  providers: {
    list: () => apiFetch<{ providers: Provider[] }>("/api/providers"),
    createAccount: (
      providerKey: string,
      body: {
        label: string;
        credentials: { apiKey?: string; token?: string; accessToken?: string };
        priority?: number;
        defaultModel?: string;
      },
    ) =>
      apiFetch<{
        account: Account;
        validation: { ok: boolean; status: string; message?: string };
      }>(`/api/providers/${providerKey}/accounts`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    updateAccount: (
      accountId: string,
      body: {
        label?: string;
        priority?: number;
        enabled?: boolean;
        defaultModel?: string | null;
        credentials?: { apiKey?: string; token?: string; accessToken?: string };
      },
    ) =>
      apiFetch<{ account: Account }>(`/api/providers/accounts/${accountId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    deleteAccount: (accountId: string) =>
      apiFetch<void>(`/api/providers/accounts/${accountId}`, { method: "DELETE" }),
    validateAccount: (accountId: string) =>
      apiFetch<{
        validation: { ok: boolean; status: string; message?: string; latencyMs?: number };
        account: Account;
      }>(`/api/providers/accounts/${accountId}/validate`, { method: "POST" }),
    syncModels: (accountId: string) =>
      apiFetch<{ models: ProviderModel[]; account: Account }>(
        `/api/providers/accounts/${accountId}/models/sync`,
        { method: "POST" },
      ),
    accountUsage: (accountId: string, refresh = false) =>
      apiFetch<{ usage: UsageSnapshot }>(
        `/api/providers/accounts/${accountId}/usage${refresh ? "?refresh=1" : ""}`,
      ),
  },
  conversations: {
    list: (params?: { status?: string; projectId?: string }) => {
      const query = new URLSearchParams();
      if (params?.status) query.set("status", params.status);
      if (params?.projectId) query.set("projectId", params.projectId);
      const suffix = query.toString() ? `?${query.toString()}` : "";
      return apiFetch<{ conversations: Conversation[] }>(
        `/api/conversations${suffix}`,
      );
    },
    get: (id: string) =>
      apiFetch<ConversationDetail>(`/api/conversations/${id}`),
    create: (body: { title?: string; projectId?: string | null; routingMode?: string }) =>
      apiFetch<{ conversation: Conversation }>("/api/conversations", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    update: (
      id: string,
      body: {
        title?: string;
        projectId?: string | null;
        routingMode?: string;
        status?: string;
        activeAccountId?: string | null;
      },
    ) =>
      apiFetch<{ conversation: Conversation }>(`/api/conversations/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    remove: (id: string) =>
      apiFetch<void>(`/api/conversations/${id}`, { method: "DELETE" }),
  },
  projects: {
    list: () => apiFetch<{ projects: Project[] }>("/api/projects"),
    get: (id: string) => apiFetch<ProjectDetail>(`/api/projects/${id}`),
    create: (body: {
      name: string;
      description?: string;
      rootPath?: string;
      gitRemoteUrl?: string;
    }) =>
      apiFetch<{ project: Project }>("/api/projects", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    update: (
      id: string,
      body: {
        name?: string;
        description?: string | null;
        rootPath?: string | null;
        gitRemoteUrl?: string | null;
      },
    ) =>
      apiFetch<{ project: Project }>(`/api/projects/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    remove: (id: string) =>
      apiFetch<void>(`/api/projects/${id}`, { method: "DELETE" }),
    addMemory: (
      projectId: string,
      body: { key: string; value: string; category?: string; pinned?: boolean },
    ) =>
      apiFetch<{ memory: Memory }>(`/api/projects/${projectId}/memories`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    updateMemory: (
      memoryId: string,
      body: { value?: string; category?: string; pinned?: boolean },
    ) =>
      apiFetch<{ memory: Memory }>(`/api/memories/${memoryId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    deleteMemory: (memoryId: string) =>
      apiFetch<void>(`/api/memories/${memoryId}`, { method: "DELETE" }),
    addTask: (
      projectId: string,
      body: { title: string; detail?: string; status?: string },
    ) =>
      apiFetch<{ task: Task }>(`/api/projects/${projectId}/tasks`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    updateTask: (
      taskId: string,
      body: { title?: string; detail?: string | null; status?: string },
    ) =>
      apiFetch<{ task: Task }>(`/api/tasks/${taskId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    deleteTask: (taskId: string) =>
      apiFetch<void>(`/api/tasks/${taskId}`, { method: "DELETE" }),
  },
  usage: {
    summary: (days = 7) =>
      apiFetch<UsageSummary>(`/api/usage/summary?days=${days}`),
    accounts: () => apiFetch<UsageAccounts>("/api/usage/accounts"),
    catalog: () =>
      apiFetch<{
        models: Array<ProviderModel & { providerKind: string; providerName: string }>;
      }>("/api/usage/catalog"),
    preview: (prompt: string) =>
      apiFetch<RoutingPreview>("/api/usage/preview", {
        method: "POST",
        body: JSON.stringify({ prompt }),
      }),
  },
  routing: {
    list: () => apiFetch<{ rules: RoutingRule[] }>("/api/routing/rules"),
    create: (body: {
      name: string;
      mode: string;
      priority?: number;
      conditions?: Record<string, unknown>;
      targetProviderKind?: string | null;
      targetModelId?: string | null;
    }) =>
      apiFetch<{ rule: RoutingRule }>("/api/routing/rules", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    update: (
      ruleId: string,
      body: { name?: string; enabled?: boolean; priority?: number; mode?: string },
    ) =>
      apiFetch<{ rule: RoutingRule }>(`/api/routing/rules/${ruleId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    remove: (ruleId: string) =>
      apiFetch<void>(`/api/routing/rules/${ruleId}`, { method: "DELETE" }),
  },
  streamChat,
};
