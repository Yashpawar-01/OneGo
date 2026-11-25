import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useSearchParams } from "react-router-dom";
import {
  Activity,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Cpu,
  FolderKanban,
  KeyRound,
  Lock,
  MessageSquare,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Square,
  User,
  Waypoints,
  Zap,
} from "lucide-react";
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
  ErrorBanner,
  ProviderGlyph,
  SegmentedControl,
  Spinner,
  cn,
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
    repositoryHits: number;
  } | null;
  classification: { type: string; confidence: number } | null;
  routingRule: { id: string; name: string } | null;
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
  routingRule: null,
  usage: null,
  error: null,
};

type AccountMeta = { label: string; providerName: string; providerKind: string };

function MessageBubble({
  message,
  accountsById,
  streaming,
  providerKind,
}: {
  message: Pick<
    ChatMessage,
    "role" | "content" | "modelId" | "providerAccountId" | "inputTokens" | "outputTokens"
  >;
  accountsById: Map<string, AccountMeta>;
  streaming?: boolean;
  providerKind?: string | null;
}) {
  const isUser = message.role === "user";
  const account = message.providerAccountId
    ? accountsById.get(message.providerAccountId)
    : undefined;
  const kind = account?.providerKind ?? providerKind ?? null;

  if (isUser) {
    return (
      <div className="flex items-start justify-end gap-2.5">
        <div className="max-w-[86%] rounded-2xl rounded-br-md border border-brand/30 bg-[linear-gradient(135deg,rgba(167,139,250,0.16),rgba(96,165,250,0.06))] px-4 py-3 text-sm leading-relaxed break-words whitespace-pre-wrap text-ink">
          {message.content}
        </div>
        <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border border-edge bg-panel-2 text-dim">
          <User className="size-3.5" />
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2.5">
      {kind ? (
        <ProviderGlyph kind={kind} size="sm" className="mt-0.5" />
      ) : (
        <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-md border border-brand/25 bg-brand/10 text-brand">
          <Sparkles className="size-3.5" />
        </span>
      )}
      <div className="min-w-0 max-w-[86%]">
        <div className="mb-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-faint">
          <span className="font-medium text-dim">{message.modelId ?? "assistant"}</span>
          {account ? (
            <span>
              · {account.label} · {account.providerName}
            </span>
          ) : null}
          {message.inputTokens !== null && message.inputTokens !== undefined ? (
            <span>
              · {formatTokens(message.inputTokens)} in / {formatTokens(message.outputTokens)} out
            </span>
          ) : null}
          {streaming ? (
            <span className="flex items-center gap-1 text-brand">
              <span className="size-1.5 animate-pulse-soft rounded-full bg-brand" />
              streaming
            </span>
          ) : null}
        </div>
        <div
          className={cn(
            "rounded-2xl rounded-tl-md border border-edge bg-panel-2/60 px-4 py-3 text-sm leading-relaxed break-words whitespace-pre-wrap text-ink",
            streaming && "stream-caret",
          )}
        >
          {message.content || (streaming ? "…" : "")}
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-[11px]">
      <span className="shrink-0 text-faint">{label}</span>
      <span className="truncate text-right text-dim">{value}</span>
    </div>
  );
}

function InspectorSection({
  title,
  icon,
  children,
  action,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="border-b border-edge/60 px-4 py-3.5 last:border-b-0">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.14em] text-faint uppercase">
          <span className="text-dim">{icon}</span>
          {title}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

const ROUTING_COPY: Record<"manual" | "automatic" | "intelligent", string> = {
  manual: "Pinned to the selected account. Failures still trigger fallback unless you stop the run.",
  automatic: "Lowest-priority healthy account. Quota, rate, or auth failures cool down automatically.",
  intelligent: "Classifies the prompt locally, then ranks synced models by capability, context, and price.",
};

function ChipSelect({
  icon,
  label,
  value,
  onChange,
  disabled,
  children,
}: {
  icon?: ReactNode;
  label: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 max-w-[200px] items-center gap-1 rounded-full border border-edge bg-canvas/60 pr-1 pl-2 text-[10px] transition-colors",
        disabled ? "opacity-55" : "hover:border-edge-strong",
      )}
    >
      {icon}
      <span className="shrink-0 text-faint">{label}</span>
      <span className="relative flex min-w-0 items-center">
        <select
          value={value}
          onChange={onChange}
          disabled={disabled}
          className="max-w-[118px] appearance-none truncate bg-transparent pr-3.5 text-[10px] font-medium text-ink focus:outline-none disabled:cursor-not-allowed"
        >
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-0 size-3 text-faint" />
      </span>
    </span>
  );
}

type TimelineTone = "brand" | "emerald" | "amber" | "faint";

const TIMELINE_DOTS: Record<TimelineTone, string> = {
  brand: "bg-brand",
  emerald: "bg-emerald-400",
  amber: "bg-amber-400",
  faint: "bg-edge-strong",
};

type TimelineStep = {
  key: string;
  tone: TimelineTone;
  title: string;
  detail?: string;
  icon?: ReactNode;
  pulse?: boolean;
};

function RunTimeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <ol className="relative space-y-3 pl-4">
      <span className="absolute top-1.5 bottom-1.5 left-[5px] w-px bg-edge" aria-hidden="true" />
      {steps.map((step) => (
        <li key={step.key} className="relative">
          <span
            className={cn(
              "absolute top-1 -left-4 size-[7px] rounded-full ring-4 ring-panel",
              TIMELINE_DOTS[step.tone],
              step.pulse && "animate-pulse-soft",
            )}
          />
          <div className="flex items-start gap-1.5">
            {step.icon ? <span className="mt-px shrink-0">{step.icon}</span> : null}
            <div className="min-w-0">
              <div className="text-[11px] leading-snug font-medium break-words text-ink">
                {step.title}
              </div>
              {step.detail ? (
                <div className="mt-0.5 text-[10px] leading-relaxed text-faint">{step.detail}</div>
              ) : null}
            </div>
          </div>
        </li>
      ))}
    </ol>
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
  const [railQuery, setRailQuery] = useState("");

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
  const creatingRef = useRef(false);
  activeIdRef.current = activeId;

  const accountsById = useMemo(() => {
    const map = new Map<string, AccountMeta>();
    for (const provider of providers) {
      for (const account of provider.accounts) {
        map.set(account.id, {
          label: account.label,
          providerName: provider.name,
          providerKind: provider.kind,
        });
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

  const filteredConversations = useMemo(() => {
    const needle = railQuery.trim().toLowerCase();
    if (!needle) return conversations;
    return conversations.filter((conversation) =>
      conversation.title.toLowerCase().includes(needle),
    );
  }, [conversations, railQuery]);

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

  useEffect(() => {
    if (searchParams.get("new") !== "1" || creatingRef.current) return;
    creatingRef.current = true;
    setSearchParams({}, { replace: true });
    void createConversation().finally(() => {
      creatingRef.current = false;
    });
    // createConversation is intentionally excluded: the query flag is the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, setSearchParams]);

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
          routingRule: event.routingRule ?? null,
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
  const conversationTitle = detail?.conversation.title ?? "New conversation";
  const contextSnapshot = detail?.contextSnapshot;
  const activeLabel = stream.label
    ? `${stream.label}${stream.providerKind ? ` · ${stream.providerKind}` : ""}`
    : detail?.conversation.activeAccountId
      ? (accountsById.get(detail.conversation.activeAccountId)?.label ?? "Active account")
      : "Auto-selected";

  const suggestions = [
    "Refactor this React component and explain the tradeoffs",
    "Walk through the current project context and open tasks",
    "Draft a safe migration plan for the PostgreSQL schema",
  ];

  const runSteps: TimelineStep[] = [];
  if (stream.routingRule) {
    runSteps.push({
      key: "rule",
      tone: "brand",
      title: stream.routingRule.name,
      detail: "routing rule applied",
    });
  }
  if (stream.classification) {
    runSteps.push({
      key: "classification",
      tone: "brand",
      title: `Classified as ${stream.classification.type}`,
      detail: `${Math.round(stream.classification.confidence * 100)}% confidence, resolved locally`,
    });
  }
  if (stream.context) {
    runSteps.push({
      key: "context",
      tone: "faint",
      title: `${stream.context.includedMessages} messages in context`,
      detail: `~${formatTokens(stream.context.tokenEstimate)} tokens · ${
        stream.context.omittedMessages
      } omitted · ${stream.context.repositoryHits} code snippets`,
    });
  }
  if (stream.attempt > 0) {
    runSteps.push({
      key: "attempt",
      tone: stream.active ? "brand" : "emerald",
      title: `${stream.label ?? activeLabel}${stream.modelId ? ` · ${stream.modelId}` : ""}`,
      detail: stream.active ? `attempt ${stream.attempt} streaming` : `attempt ${stream.attempt} completed`,
      icon: stream.providerKind ? <ProviderGlyph kind={stream.providerKind} size="sm" /> : null,
      pulse: stream.active,
    });
  }
  stream.fallbacks.forEach((fallback, index) => {
    runSteps.push({
      key: `fallback-${index}`,
      tone: "amber",
      title: `Fallback · ${fallback.reason.replaceAll("_", " ")}`,
      detail: fallback.message,
    });
  });
  if (stream.usage) {
    runSteps.push({
      key: "usage",
      tone: "emerald",
      title: "Usage recorded",
      detail: `${formatTokens(stream.usage.inputTokens)} in · ${formatTokens(
        stream.usage.outputTokens,
      )} out`,
    });
  }

  const contextChip = stream.context
    ? `${stream.context.includedMessages} msgs · ~${formatTokens(
        stream.context.tokenEstimate,
      )}${stream.context.repositoryHits > 0 ? ` · ${stream.context.repositoryHits} code` : ""}`
    : contextSnapshot
      ? `snapshot v${contextSnapshot.version}${
          contextSnapshot.tokenCount ? ` · ${formatTokens(contextSnapshot.tokenCount)} tok` : ""
        }`
      : null;

  return (
    <div className="flex flex-col gap-4 lg:h-[calc(100vh-8rem)] lg:min-h-[640px]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.16em] text-brand uppercase">
            <Sparkles className="size-3.5" /> AI Workspace
          </div>
          <h1 className="mt-1.5 font-display text-[24px] leading-tight font-semibold tracking-[-0.02em]">
            One thread. Every provider.
          </h1>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-dim">
            OneGo streams the reply, records real usage, and falls back automatically when a
            provider hits a limit — with the full context preserved.
          </p>
        </div>
        <Button variant="primary" onClick={() => void createConversation()}>
          <Plus className="size-4" />
          New conversation
        </Button>
      </div>

      {error ? <ErrorBanner message={error} /> : null}

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[250px_minmax(0,1fr)] xl:grid-cols-[250px_minmax(0,1fr)_304px]">
        <Card padding="none" className="flex max-h-64 flex-col lg:max-h-none">
          <div className="flex items-center justify-between gap-2 border-b border-edge/70 px-3 py-2.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-ink">
              <MessageSquare className="size-3.5 text-brand" />
              Threads
              <span className="rounded-full border border-edge bg-panel-2 px-1.5 text-[10px] text-faint">
                {conversations.length}
              </span>
            </div>
            <button
              type="button"
              onClick={() => void createConversation()}
              className="grid size-6 place-items-center rounded-md text-dim transition-colors hover:bg-white/[0.06] hover:text-ink"
              aria-label="New conversation"
            >
              <Plus className="size-3.5" />
            </button>
          </div>
          <div className="border-b border-edge/60 p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-faint" />
              <input
                value={railQuery}
                onChange={(event) => setRailQuery(event.target.value)}
                placeholder="Filter threads…"
                className="w-full rounded-md border border-edge bg-canvas/60 py-1.5 pr-2 pl-8 text-[11px] text-ink placeholder:text-faint focus:border-brand/50 focus:outline-none"
              />
            </div>
          </div>
          <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-1.5">
            {filteredConversations.length === 0 ? (
              <p className="px-2 py-6 text-center text-[11px] text-faint">
                {conversations.length === 0
                  ? "No active threads yet."
                  : "No thread matches this filter."}
              </p>
            ) : (
              <ul className="space-y-0.5">
                {filteredConversations.map((conversation) => {
                  const active = conversation.id === activeId;
                  return (
                    <li key={conversation.id}>
                      <button
                        type="button"
                        onClick={() => openConversation(conversation.id)}
                        className={cn(
                          "relative w-full rounded-lg px-2.5 py-2 text-left transition-colors",
                          active
                            ? "bg-white/[0.06] text-ink"
                            : "text-dim hover:bg-white/[0.03] hover:text-ink",
                        )}
                      >
                        {active ? (
                          <span className="absolute top-2 bottom-2 left-0 w-[2px] rounded-full bg-gradient-to-b from-brand to-brand-3" />
                        ) : null}
                        <span className="block truncate text-[12px] font-medium">
                          {conversation.title}
                        </span>
                        <span className="mt-0.5 flex items-center gap-1.5 text-[10px] text-faint">
                          {stream.active && conversation.id === activeId ? (
                            <span className="inline-flex items-center gap-1 text-emerald-300">
                              <span className="size-1.5 animate-pulse-soft rounded-full bg-emerald-400" />
                              running
                            </span>
                          ) : null}
                          {conversation.messageCount ?? 0} messages
                          <span className="size-0.5 rounded-full bg-faint" />
                          {formatRelative(
                            conversation.lastMessageAt ?? conversation.updatedAt,
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="border-t border-edge/60 p-2">
            <div className="flex items-center gap-1.5 px-1 text-[10px] text-faint">
              <Lock className="size-3" />
              Context preserved across switches
            </div>
          </div>
        </Card>

        <Card padding="none" className="flex min-h-[68vh] min-w-0 flex-col lg:min-h-0">
          <div className="border-b border-edge/70 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <h2 className="truncate font-display text-sm font-semibold text-ink">
                    {conversationTitle}
                  </h2>
                  {detail ? (
                    <button
                      type="button"
                      onClick={renameConversation}
                      className="grid size-6 place-items-center rounded-md text-faint transition-colors hover:bg-white/[0.06] hover:text-ink"
                      aria-label="Rename conversation"
                    >
                      <Pencil className="size-3" />
                    </button>
                  ) : null}
                  <Badge tone="info">{routingMode}</Badge>
                  {detail?.conversation.version ? (
                    <span className="text-[10px] text-faint">v{detail.conversation.version}</span>
                  ) : null}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[10px] text-faint">
                  <span>{detail?.conversation.projectName ?? "No project"}</span>
                  {contextSnapshot ? (
                    <span>
                      · context v{contextSnapshot.version}
                      {contextSnapshot.tokenCount
                        ? ` · ${formatTokens(contextSnapshot.tokenCount)} tokens`
                        : ""}
                    </span>
                  ) : null}
                  <span>· {messages.length} messages</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <SegmentedControl
                  ariaLabel="Routing mode"
                  size="sm"
                  value={routingMode}
                  onChange={(mode) => {
                    setRoutingMode(mode);
                    if (detail) void patchConversation(detail.conversation.id, { routingMode: mode });
                  }}
                  options={[
                    { value: "manual", label: "Manual", icon: Lock },
                    { value: "automatic", label: "Auto", icon: Waypoints },
                    { value: "intelligent", label: "Smart", icon: Sparkles },
                  ]}
                />
              </div>
            </div>
          </div>

          <div className="scrollbar-thin relative min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-5">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_40%_at_50%_0%,rgba(167,139,250,0.045),transparent_70%)]" />
            {detailLoading && messages.length === 0 ? (
              <div className="relative py-6">
                <Spinner label="Loading messages…" />
              </div>
            ) : null}
            {!detailLoading && messages.length === 0 && !optimisticUser && !stream.active ? (
              <div className="relative mx-auto flex max-w-md flex-col items-center px-2 py-10 text-center">
                <div className="mb-4 flex items-center -space-x-2">
                  {(["openai", "anthropic", "github-copilot", "qoder"] as const).map((kind) => (
                    <ProviderGlyph
                      key={kind}
                      kind={kind}
                      size="md"
                      className="ring-2 ring-panel"
                    />
                  ))}
                </div>
                <h3 className="font-display text-base font-semibold text-ink">
                  Start with any provider
                </h3>
                <p className="mt-1.5 text-xs leading-relaxed text-dim">
                  {detail
                    ? "Send the first prompt. The reply streams live and the run inspector records every attempt."
                    : "Pick a routing mode above or ask directly — OneGo creates the thread for you."}
                </p>
                <div className="mt-5 w-full space-y-1.5">
                  {suggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => setDraft(suggestion)}
                      className="flex w-full items-center justify-between gap-2 rounded-lg border border-edge/80 bg-panel-2/40 px-3 py-2 text-left text-[11px] text-dim transition-colors hover:border-edge-strong hover:text-ink"
                    >
                      <span className="truncate">{suggestion}</span>
                      <ChevronRight className="size-3.5 shrink-0 text-faint" />
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="relative space-y-5">
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
                  providerKind={stream.providerKind}
                  streaming={stream.active}
                />
              ) : null}
              {stream.fallbacks.map((fallback, index) => (
                <div
                  key={`${fallback.reason}-${index}`}
                  className="flex items-start gap-2 rounded-xl border border-amber-400/25 bg-amber-400/[0.07] px-3 py-2 text-[11px] text-amber-200"
                >
                  <Waypoints className="mt-0.5 size-3.5 shrink-0" />
                  <span>
                    <span className="font-semibold">
                      Fallback ({fallback.reason.replaceAll("_", " ")})
                    </span>{" "}
                    — {fallback.message}
                  </span>
                </div>
              ))}
              {stream.error ? <ErrorBanner message={stream.error} /> : null}
              <div ref={bottomRef} />
            </div>
          </div>

          <div className="border-t border-edge/70 bg-panel/40 p-3">
            <div className="rounded-xl border border-edge bg-canvas/70 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition-colors focus-within:border-brand/50 focus-within:ring-2 focus-within:ring-brand/15">
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void send();
                  }
                }}
                placeholder="Ask across your providers…"
                className="scrollbar-thin max-h-40 min-h-12 w-full resize-none bg-transparent py-1 text-sm leading-relaxed text-ink placeholder:text-faint focus:outline-none"
                disabled={stream.active}
              />
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {routingMode === "manual" ? (
                  <>
                    <ChipSelect
                      icon={<KeyRound className="size-3 text-faint" />}
                      label="account"
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
                    >
                      <option value="">auto</option>
                      {selectableAccounts.map((entry) => (
                        <option key={entry.account.id} value={entry.account.id}>
                          {entry.account.label}
                        </option>
                      ))}
                    </ChipSelect>
                    <ChipSelect
                      icon={<Cpu className="size-3 text-faint" />}
                      label="model"
                      value={selectedModelId}
                      onChange={(event) => setSelectedModelId(event.target.value)}
                      disabled={!selectedAccount}
                    >
                      <option value="">default</option>
                      {(selectedAccount?.models ?? []).map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.displayName}
                        </option>
                      ))}
                    </ChipSelect>
                  </>
                ) : null}
                <ChipSelect
                  icon={<FolderKanban className="size-3 text-faint" />}
                  label="project"
                  value={detail?.conversation.projectId ?? ""}
                  onChange={(event) => {
                    if (detail) {
                      void patchConversation(detail.conversation.id, {
                        projectId: event.target.value || null,
                      });
                    }
                  }}
                  disabled={!detail}
                >
                  <option value="">none</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </ChipSelect>
                {contextChip ? (
                  <span
                    className="inline-flex h-6 items-center gap-1 rounded-full border border-edge bg-canvas/60 px-2 text-[10px] text-dim"
                    title={
                      stream.context
                        ? "Assembled for this run"
                        : "Context persisted with the last completed run"
                    }
                  >
                    <Zap className="size-3 text-faint" />
                    {contextChip}
                  </span>
                ) : null}
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-edge/60 pt-2">
                <span className="flex min-w-0 items-center gap-1.5 truncate text-[10px] text-faint">
                  <span className="hidden sm:inline">Enter to send · Shift+Enter for newline</span>
                  <span className="hidden text-edge-strong sm:inline">/</span>
                  <span className="truncate">{ROUTING_COPY[routingMode]}</span>
                </span>
                {stream.active ? (
                  <Button variant="danger" size="sm" onClick={stop}>
                    <Square className="size-3.5" />
                    Stop
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => void send()}
                    disabled={!draft.trim()}
                  >
                    Send
                    <ArrowUp className="size-3.5" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        </Card>

        <Card padding="none" className="hidden min-h-0 flex-col xl:flex">
          <div className="flex items-center justify-between border-b border-edge/70 px-4 py-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-ink">
              <Activity className="size-3.5 text-brand" />
              Run inspector
            </div>
            <Badge tone={stream.active ? "good" : "neutral"} dot>
              {stream.active ? "live" : "idle"}
            </Badge>
          </div>
          <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
            <InspectorSection title="Routing" icon={<Waypoints className="size-3" />}>
              <InfoRow label="Mode" value={routingMode} />
              {stream.routingRule ? (
                <InfoRow label="Rule" value={stream.routingRule.name} />
              ) : null}
              <InfoRow label="Target" value={activeLabel} />
              <InfoRow label="Model" value={stream.modelId ?? selectedModelId ?? "provider default"} />
              <InfoRow label="Project" value={detail?.conversation.projectName ?? "none"} />
              <p className="mt-2 rounded-lg border border-edge/70 bg-canvas/50 p-2 text-[10px] leading-relaxed text-faint">
                {ROUTING_COPY[routingMode]}
              </p>
            </InspectorSection>

            <InspectorSection title="Context" icon={<Zap className="size-3" />}>
              {stream.context ? (
                <>
                  <InfoRow label="Included" value={`${stream.context.includedMessages} messages`} />
                  <InfoRow
                    label="Estimated"
                    value={`${formatTokens(stream.context.tokenEstimate)} tokens`}
                  />
                  <InfoRow label="Omitted" value={`${stream.context.omittedMessages} messages`} />
                  <InfoRow label="Max output" value={formatTokens(stream.context.maxTokens)} />
                  <InfoRow
                    label="Code hits"
                    value={
                      stream.context.repositoryHits > 0
                        ? `${stream.context.repositoryHits} snippets`
                        : "none"
                    }
                  />
                  {stream.classification ? (
                    <InfoRow
                      label="Classified"
                      value={`${stream.classification.type} (${Math.round(
                        stream.classification.confidence * 100,
                      )}%)`}
                    />
                  ) : null}
                </>
              ) : contextSnapshot ? (
                <>
                  <InfoRow label="Snapshot" value={`v${contextSnapshot.version}`} />
                  <InfoRow
                    label="Tokens"
                    value={
                      contextSnapshot.tokenCount
                        ? formatTokens(contextSnapshot.tokenCount)
                        : "not reported"
                    }
                  />
                  <InfoRow label="Trigger" value={contextSnapshot.trigger.toLowerCase()} />
                  <InfoRow label="Captured" value={formatRelative(contextSnapshot.createdAt)} />
                  <p className="mt-2 text-[10px] leading-relaxed text-faint">
                    Context is rebuilt from persisted messages; a live preview appears on the next
                    run.
                  </p>
                </>
              ) : (
                <p className="py-2 text-[11px] leading-relaxed text-faint">
                  No context snapshot yet. Send a prompt to see how history is assembled for this
                  thread.
                </p>
              )}
            </InspectorSection>

            <InspectorSection
              title="Run timeline"
              icon={<Sparkles className="size-3" />}
              action={
                stream.attempt > 0 ? (
                  <span className="text-[10px] text-faint">#{stream.attempt}</span>
                ) : null
              }
            >
              {runSteps.length > 0 ? (
                <RunTimeline steps={runSteps} />
              ) : (
                <p className="text-[11px] leading-relaxed text-faint">
                  Idle. The next request records its rule, context, attempts, fallbacks, and usage
                  here.
                </p>
              )}

              {detail && detail.switches.length > 0 ? (
                <div className="mt-3">
                  <div className="mb-1 text-[10px] font-semibold tracking-[0.12em] text-faint uppercase">
                    Previous switches
                  </div>
                  <ul className="space-y-1">
                    {detail.switches.slice(0, 4).map((item) => (
                      <li key={item.id} className="text-[10px] leading-relaxed text-faint">
                        <span className="font-mono">{item.from?.label ?? "?"}</span> →{" "}
                        <span className="font-mono">{item.to?.label ?? "?"}</span>
                        <span className="text-faint/70">
                          {" "}
                          · {item.reason.replaceAll("_", " ")} · {formatRelative(item.createdAt)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </InspectorSection>

            <InspectorSection title="Usage" icon={<Activity className="size-3" />}>
              {stream.usage ? (
                <>
                  <InfoRow label="Input" value={formatTokens(stream.usage.inputTokens)} />
                  <InfoRow label="Output" value={formatTokens(stream.usage.outputTokens)} />
                  <InfoRow label="Total" value={formatTokens(stream.usage.totalTokens)} />
                </>
              ) : (
                <p className="text-[11px] leading-relaxed text-faint">
                  Usage is written only when the provider reports it. Copilot and Qoder token
                  meters are not exposed, so they stay blank.
                </p>
              )}
              <InfoRow label="Messages" value={messages.length} />
            </InspectorSection>
          </div>
        </Card>
      </div>
    </div>
  );
}
