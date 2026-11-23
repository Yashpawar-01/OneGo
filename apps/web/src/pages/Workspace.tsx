import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { useSearchParams } from "react-router-dom";
import {
  api,
  ApiError,
  type ChatMessage,
  type ChatStreamEvent,
  type Conversation,
  type ConversationDetail,
  type Project,
  type Provider,
} from "../lib/api.js";
import { notifyDataChanged } from "../lib/events.js";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  PageHeader,
  Select,
  Spinner,
  Textarea,
  formatRelative,
  formatTokens,
} from "../components/ui.js";

type StreamState = {
  active: boolean;
  text: string;
  accountId: string | null;
  label: string | null;
  providerKind: string | null;
  modelId: string | null;
  attempt: number;
  fallbacks: Array<{ reason: string; message: string }>;
  context: {
    includedMessages: number;
    omittedMessages: number;
    tokenEstimate: number;
    maxTokens: number;
  } | null;
  classification: { type: string; confidence: number } | null;
  usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number } | null;
  error: string | null;
};

const EMPTY_STREAM: StreamState = {
  active: false,
  text: "",
  accountId: null,
  label: null,
  providerKind: null,
  modelId: null,
  attempt: 0,
  fallbacks: [],
  context: null,
  classification: null,
  usage: null,
  error: null,
};

function accountLabel(
  accountsById: Map<string, { label: string; providerName: string }>,
  accountId: string | null,
): string | null {
  if (!accountId) return null;
  const account = accountsById.get(accountId);
  return account ? `${account.label} · ${account.providerName}` : null;
}

function MessageBubble({
  message,
  accountsById,
  streaming,
}: {
  message: Pick<
    ChatMessage,
    "role" | "content" | "modelId" | "providerAccountId" | "inputTokens" | "outputTokens"
  >;
  accountsById: Map<string, { label: string; providerName: string }>;
  streaming?: boolean;
}) {
  const isUser = message.role === "user";
  return (
    <div className={isUser ? "flex justify-end" : "flex justify-start"}>
      <div
        className={[
          "max-w-[92%] rounded-xl border px-4 py-3 text-sm leading-relaxed",
          isUser
            ? "border-brand/30 bg-brand/10 text-ink"
            : "border-edge bg-panel/70 text-ink",
        ].join(" ")}
      >
        {!isUser ? (
          <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[11px] text-dim">
            <Badge tone="neutral">
              {message.modelId ?? "assistant"}
            </Badge>
            {message.providerAccountId ? (
              <span>
                {accountLabel(accountsById, message.providerAccountId) ?? "provider account"}
              </span>
            ) : null}
            {message.inputTokens !== null && message.inputTokens !== undefined ? (
              <span>
                {formatTokens(message.inputTokens)} in · {formatTokens(message.outputTokens)} out
              </span>
            ) : null}
            {streaming ? <span className="animate-pulse text-brand">streaming…</span> : null}
          </div>
        ) : null}
        <div className="whitespace-pre-wrap break-words">
          {message.content || (streaming ? "…" : "")}
        </div>
      </div>
    </div>
  );
}

export function Workspace() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeId = searchParams.get("conversation");

  const [providers, setProviders] = useState<Provider[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [draft, setDraft] = useState("");
  const [routingMode, setRoutingMode] = useState<"manual" | "automatic" | "intelligent">(
    "manual",
  );
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [selectedModelId, setSelectedModelId] = useState<string>("");
  const [stream, setStream] = useState<StreamState>(EMPTY_STREAM);
  const [optimisticUser, setOptimisticUser] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;

  const accountsById = useMemo(() => {
    const map = new Map<string, { label: string; providerName: string }>();
    for (const provider of providers) {
      for (const account of provider.accounts) {
        map.set(account.id, { label: account.label, providerName: provider.name });
      }
    }
    return map;
  }, [providers]);

  const selectableAccounts = useMemo(
    () =>
      providers.flatMap((provider) =>
        provider.accounts
          .filter((account) => account.enabled)
          .map((account) => ({
            account,
            providerName: provider.name,
            providerKind: provider.kind,
            models: provider.models,
          })),
      ),
    [providers],
  );

  const selectedAccount = selectableAccounts.find(
    (entry) => entry.account.id === selectedAccountId,
  );

  const loadShell = useCallback(async () => {
    try {
      const [providerResult, projectResult, conversationResult] = await Promise.all([
        api.providers.list(),
        api.projects.list(),
        api.conversations.list({ status: "active" }),
      ]);
      setProviders(providerResult.providers);
      setProjects(projectResult.projects);
      setConversations(conversationResult.conversations);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err as Error).message);
    }
  }, []);

  useEffect(() => {
    void loadShell();
  }, [loadShell]);

  const loadDetail = useCallback(async (conversationId: string) => {
    setDetailLoading(true);
    try {
      const result = await api.conversations.get(conversationId);
      setDetail(result);
      setRoutingMode(result.conversation.routingMode);
      setSelectedAccountId(result.conversation.activeAccountId ?? "");
      setError(null);
    } catch (err) {
      setDetail(null);
      setError(err instanceof ApiError ? err.message : (err as Error).message);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!activeId) {
      setDetail(null);
      return;
    }
    void loadDetail(activeId);
    setStream(EMPTY_STREAM);
    setOptimisticUser(null);
  }, [activeId, loadDetail]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [detail?.messages.length, stream.text, optimisticUser]);

  const openConversation = (conversationId: string) => {
    setSearchParams({ conversation: conversationId }, { replace: true });
  };

  const createConversation = async (): Promise<Conversation | null> => {
    try {
      const result = await api.conversations.create({ routingMode });
      setConversations((current) => [result.conversation, ...current]);
      openConversation(result.conversation.id);
      notifyDataChanged();
      return result.conversation;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err as Error).message);
      return null;
    }
  };

  const patchConversation = async (
    conversationId: string,
    body: {
      routingMode?: string;
      projectId?: string | null;
      title?: string;
      activeAccountId?: string | null;
    },
  ) => {
    try {
      const result = await api.conversations.update(conversationId, body);
      setDetail((current) =>
        current ? { ...current, conversation: result.conversation } : current,
      );
      setConversations((current) =>
        current.map((item) => (item.id === result.conversation.id ? result.conversation : item)),
      );
      notifyDataChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err as Error).message);
    }
  };

  const handleStreamEvent = useCallback((event: ChatStreamEvent) => {
    switch (event.type) {
      case "meta":
        setStream((current) => ({
          ...current,
          context: event.context,
          classification: event.classification
            ? { type: event.classification.type, confidence: event.classification.confidence }
            : null,
        }));
        break;
      case "attempt_started":
        setStream((current) => ({
          ...current,
          accountId: event.accountId,
          providerKind: event.providerKind,
          modelId: event.modelId,
          label: event.label ?? null,
          attempt: event.attempt,
        }));
        break;
      case "delta":
        setStream((current) => ({ ...current, text: current.text + event.delta }));
        break;
      case "usage":
        setStream((current) => ({ ...current, usage: event.usage }));
        break;
      case "fallback":
        setStream((current) => ({
          ...current,
          fallbacks: [
            ...current.fallbacks,
            { reason: event.reason, message: event.message },
          ],
        }));
        break;
      case "error":
        setStream((current) => ({
          ...current,
          error: event.error.message,
        }));
        break;
      case "done":
        break;
      default:
        break;
    }
  }, []);

  const send = async () => {
    const content = draft.trim();
    if (!content || stream.active) return;

    let conversation = detail?.conversation ?? null;
    if (!conversation) {
      conversation = await createConversation();
      if (!conversation) return;
    }

    setDraft("");
    setError(null);
    setOptimisticUser(content);
    setStream({
      ...EMPTY_STREAM,
      active: true,
      accountId: routingMode === "manual" ? selectedAccountId || null : null,
    });

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await api.streamChat(
        conversation.id,
        {
          content,
          accountId: routingMode === "manual" ? selectedAccountId || null : null,
          modelId: routingMode === "manual" ? selectedModelId || null : null,
          routingMode,
        },
        handleStreamEvent,
        controller.signal,
      );
    } catch (err) {
      if (!controller.signal.aborted) {
        setStream((current) => ({
          ...current,
          error: err instanceof ApiError ? err.message : (err as Error).message,
        }));
      }
    } finally {
      abortRef.current = null;
      setStream((current) => ({ ...current, active: false }));
      setOptimisticUser(null);
      if (activeIdRef.current === conversation.id) {
        void loadDetail(conversation.id);
      }
      void loadShell();
      notifyDataChanged();
    }
  };

  const stop = () => {
    abortRef.current?.abort();
  };

  const renameConversation = () => {
    if (!detail) return;
    const title = window.prompt("Rename conversation", detail.conversation.title);
    if (!title || !title.trim()) return;
    void patchConversation(detail.conversation.id, { title: title.trim() });
  };

  const messages = detail?.messages ?? [];

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <PageHeader
        title="AI Workspace"
        description="One conversation across every provider. OneGo streams the reply, records usage, and falls back automatically when a provider hits a limit."
        actions={
          <Button variant="primary" onClick={() => void createConversation()}>
            New conversation
          </Button>
        }
      />

      {error ? <ErrorBanner message={error} /> : null}

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[260px_1fr]">
        <Card className="max-h-[70vh] overflow-auto p-3 lg:max-h-none">
          <div className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-widest text-dim/70">
            Conversations
          </div>
          {conversations.length === 0 ? (
            <p className="px-1 text-xs text-dim">No active conversations yet.</p>
          ) : (
            <ul className="space-y-0.5">
              {conversations.map((conversation) => (
                <li key={conversation.id}>
                  <button
                    type="button"
                    onClick={() => openConversation(conversation.id)}
                    className={[
                      "w-full rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                      conversation.id === activeId
                        ? "bg-brand/10 text-brand"
                        : "text-dim hover:bg-white/5 hover:text-ink",
                    ].join(" ")}
                  >
                    <span className="block truncate">{conversation.title}</span>
                    <span className="mt-0.5 block text-[10px] text-dim/70">
                      {conversation.messageCount ?? 0} messages ·{" "}
                      {formatRelative(conversation.lastMessageAt ?? conversation.updatedAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="flex min-h-0 flex-col gap-3">
          {!activeId ? (
            <Card className="flex flex-1 items-center justify-center">
              <EmptyState
                title="Start a conversation"
                description="Pick an existing thread on the left or create a new one. Every request is routed through a connected provider account."
                action={
                  <Button variant="primary" onClick={() => void createConversation()}>
                    New conversation
                  </Button>
                }
              />
            </Card>
          ) : (
            <>
              <Card className="p-3">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-sm font-semibold text-ink">
                        {detail?.conversation.title ?? "Conversation"}
                      </h2>
                      <button
                        type="button"
                        onClick={renameConversation}
                        className="text-[11px] text-dim hover:text-ink"
                      >
                        rename
                      </button>
                      <Badge tone="neutral">{routingMode}</Badge>
                      {detail?.conversation.version ? (
                        <span className="text-[11px] text-dim">
                          v{detail.conversation.version}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-0.5 text-xs text-dim">
                      {detail?.conversation.projectName ?? "No project"}
                      {detail?.contextSnapshot
                        ? ` · context v${detail.contextSnapshot.version} (${formatTokens(
                            detail.contextSnapshot.tokenCount,
                          )} tokens, ${detail.contextSnapshot.trigger.toLowerCase()})`
                        : ""}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Select
                      aria-label="Routing mode"
                      value={routingMode}
                      onChange={(event) => {
                        const mode = event.target.value as typeof routingMode;
                        setRoutingMode(mode);
                        if (detail) void patchConversation(detail.conversation.id, { routingMode: mode });
                      }}
                      className="w-auto"
                    >
                      <option value="manual">Manual</option>
                      <option value="automatic">Automatic</option>
                      <option value="intelligent">Intelligent</option>
                    </Select>
                    {routingMode === "manual" ? (
                      <>
                        <Select
                          aria-label="Provider account"
                          value={selectedAccountId}
                          onChange={(event) => {
                            setSelectedAccountId(event.target.value);
                            setSelectedModelId("");
                            if (detail) {
                              void patchConversation(detail.conversation.id, {
                                activeAccountId: event.target.value || null,
                              });
                            }
                          }}
                          className="w-auto"
                        >
                          <option value="">Active / auto</option>
                          {selectableAccounts.map((entry) => (
                            <option key={entry.account.id} value={entry.account.id}>
                              {entry.account.label} · {entry.providerName}
                            </option>
                          ))}
                        </Select>
                        <Select
                          aria-label="Model"
                          value={selectedModelId}
                          onChange={(event) => setSelectedModelId(event.target.value)}
                          className="w-auto"
                        >
                          <option value="">Default model</option>
                          {(selectedAccount?.models ?? []).map((model) => (
                            <option key={model.id} value={model.id}>
                              {model.displayName}
                            </option>
                          ))}
                        </Select>
                      </>
                    ) : null}
                    <Select
                      aria-label="Project"
                      value={detail?.conversation.projectId ?? ""}
                      onChange={(event) => {
                        if (detail) {
                          void patchConversation(detail.conversation.id, {
                            projectId: event.target.value || null,
                          });
                        }
                      }}
                      className="w-auto"
                      disabled={!detail}
                    >
                      <option value="">No project</option>
                      {projects.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>
              </Card>

              <Card className="flex min-h-0 flex-1 flex-col p-0">
                <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4">
                  {detailLoading && messages.length === 0 ? (
                    <Spinner label="Loading messages…" />
                  ) : null}
                  {!detailLoading && messages.length === 0 && !optimisticUser ? (
                    <p className="py-6 text-center text-sm text-dim">
                      No messages yet. Send the first prompt below.
                    </p>
                  ) : null}
                  {messages.map((message) => (
                    <MessageBubble
                      key={message.id}
                      message={message}
                      accountsById={accountsById}
                    />
                  ))}
                  {optimisticUser ? (
                    <MessageBubble
                      message={{
                        role: "user",
                        content: optimisticUser,
                        modelId: null,
                        providerAccountId: null,
                        inputTokens: null,
                        outputTokens: null,
                      }}
                      accountsById={accountsById}
                    />
                  ) : null}
                  {stream.active || stream.text ? (
                    <MessageBubble
                      message={{
                        role: "assistant",
                        content: stream.text,
                        modelId: stream.modelId,
                        providerAccountId: stream.accountId,
                        inputTokens: null,
                        outputTokens: null,
                      }}
                      accountsById={accountsById}
                      streaming={stream.active}
                    />
                  ) : null}
                  {stream.fallbacks.map((fallback, index) => (
                    <div
                      key={index}
                      className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200"
                    >
                      Fallback ({fallback.reason}): {fallback.message}
                    </div>
                  ))}
                  {stream.error ? <ErrorBanner message={stream.error} /> : null}
                  {stream.context || stream.classification ? (
                    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-edge bg-canvas/40 px-3 py-2 text-[11px] text-dim">
                      {stream.context ? (
                        <>
                          <span>
                            context {stream.context.includedMessages} messages ·{" "}
                            {formatTokens(stream.context.tokenEstimate)} tokens
                          </span>
                          {stream.context.omittedMessages > 0 ? (
                            <span>· {stream.context.omittedMessages} omitted</span>
                          ) : null}
                          <span>· max {formatTokens(stream.context.maxTokens)} output</span>
                        </>
                      ) : null}
                      {stream.classification ? (
                        <span>
                          · classified {stream.classification.type} (
                          {Math.round(stream.classification.confidence * 100)}%)
                        </span>
                      ) : null}
                      {stream.usage?.totalTokens ? (
                        <span>
                          · used {formatTokens(stream.usage.totalTokens)} tokens
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                  <div ref={bottomRef} />
                </div>

                <div className="border-t border-edge p-3">
                  <div className="flex items-end gap-2">
                    <Textarea
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          void send();
                        }
                      }}
                      placeholder="Ask across your providers… (Enter to send, Shift+Enter for a newline)"
                      className="min-h-16 flex-1 resize-none"
                      disabled={stream.active}
                    />
                    {stream.active ? (
                      <Button variant="danger" onClick={stop}>
                        Stop
                      </Button>
                    ) : (
                      <Button variant="primary" onClick={() => void send()} disabled={!draft.trim()}>
                        Send
                      </Button>
                    )}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-dim">
                    <span>
                      {routingMode === "manual"
                        ? selectedAccount
                          ? `Manual → ${selectedAccount.account.label} · ${selectedAccount.providerName}`
                          : selectedAccountId
                            ? "Manual → selected account"
                            : "Manual → conversation's active account"
                        : routingMode === "automatic"
                          ? "Automatic → lowest-priority healthy account"
                          : "Intelligent → task classification picks the model"}
                    </span>
                  </div>
                </div>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
