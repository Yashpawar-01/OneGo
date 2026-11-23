import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Archive,
  ArchiveRestore,
  ArrowUpRight,
  Clock,
  FolderKanban,
  MessagesSquare,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Waypoints,
} from "lucide-react";
import {
  api,
  ApiError,
  type Conversation,
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
  ProviderGlyph,
  SegmentedControl,
  Select,
  Skeleton,
  cn,
  formatDateTime,
  formatRelative,
} from "../components/ui.js";

export function Conversations() {
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [status, setStatus] = useState("active");
  const [projectId, setProjectId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      api.conversations.list({
        status,
        projectId: projectId || undefined,
      }),
      api.projects.list(),
      api.providers.list(),
    ])
      .then(([conversationResult, projectResult, providerResult]) => {
        setConversations(conversationResult.conversations);
        setProjects(projectResult.projects);
        setProviders(providerResult.providers);
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message);
        setLoading(false);
      });
  }, [status, projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const accountById = useMemo(() => {
    const map = new Map<string, { label: string; providerName: string; providerKind: string }>();
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

  const totals = useMemo(() => {
    const messages = conversations.reduce((sum, item) => sum + (item.messageCount ?? 0), 0);
    const projectsRepresented = new Set(
      conversations.map((item) => item.projectId).filter(Boolean),
    ).size;
    return { messages, projectsRepresented };
  }, [conversations]);

  const rename = async (conversation: Conversation) => {
    const title = window.prompt("Rename conversation", conversation.title);
    if (!title || !title.trim() || title.trim() === conversation.title) return;
    try {
      await api.conversations.update(conversation.id, { title: title.trim() });
      notifyDataChanged();
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err as Error).message);
    }
  };

  const toggleArchive = async (conversation: Conversation) => {
    const next = conversation.status === "active" ? "archived" : "active";
    try {
      await api.conversations.update(conversation.id, { status: next });
      notifyDataChanged();
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err as Error).message);
    }
  };

  const remove = async (conversation: Conversation) => {
    if (
      !window.confirm(
        `Delete "${conversation.title}" and all its messages? This cannot be undone.`,
      )
    )
      return;
    try {
      await api.conversations.remove(conversation.id);
      notifyDataChanged();
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={
          <>
            <Waypoints className="size-3.5" />
            Cross-provider threads
          </>
        }
        title="Conversations"
        description="Every thread keeps its message history, provider switches, and context snapshots so any provider can continue where another stopped."
        actions={
          <>
            <SegmentedControl
              ariaLabel="Conversation status"
              size="sm"
              value={status}
              onChange={setStatus}
              options={[
                { value: "active", label: "Active" },
                { value: "archived", label: "Archived" },
                { value: "all", label: "All" },
              ]}
            />
            <Select
              aria-label="Project filter"
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
              className="h-8 w-auto py-0 text-xs"
            >
              <option value="">All projects</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </Select>
            <Button variant="secondary" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
              Refresh
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => navigate("/workspace?new=1")}
            >
              <Plus className="size-3.5" />
              New
            </Button>
          </>
        }
      />

      {error ? <ErrorBanner message={error} onRetry={load} /> : null}

      <section className="grid gap-3 sm:grid-cols-3">
        <ThreadStat
          icon={<MessagesSquare className="size-4" />}
          label="Threads in view"
          value={conversations.length}
          accent="border-brand/25 bg-brand/10 text-[#b9c3ff]"
        />
        <ThreadStat
          icon={<Waypoints className="size-4" />}
          label="Messages in view"
          value={totals.messages}
          accent="border-cyan-400/25 bg-cyan-400/10 text-cyan-300"
        />
        <ThreadStat
          icon={<FolderKanban className="size-4" />}
          label="Projects represented"
          value={totals.projectsRepresented}
          accent="border-[#b18cff]/25 bg-[#b18cff]/10 text-[#d8c6ff]"
        />
      </section>

      {loading && conversations.length === 0 ? (
        <Card className="space-y-2" padding="sm">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-16 w-full" />
          ))}
        </Card>
      ) : conversations.length === 0 ? (
        <EmptyState
          icon={<MessagesSquare className="size-5" />}
          title="No conversations in this view"
          description="Start a new conversation in the workspace, or change the filters above."
          action={
            <Button variant="primary" onClick={() => navigate("/workspace?new=1")}>
              <Plus className="size-3.5" />
              New conversation
            </Button>
          }
        />
      ) : (
        <Card padding="none" className="overflow-hidden">
          <ul className="divide-y divide-edge/60">
            {conversations.map((conversation) => {
              const account = conversation.activeAccountId
                ? accountById.get(conversation.activeAccountId)
                : null;
              return (
                <li
                  key={conversation.id}
                  className="group flex flex-wrap items-start justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-white/[0.025]"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    {account ? (
                      <ProviderGlyph kind={account.providerKind} />
                    ) : (
                      <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-edge bg-white/[0.03] text-dim">
                        <MessagesSquare className="size-4" />
                      </span>
                    )}
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Link
                          to={`/workspace?conversation=${conversation.id}`}
                          className="truncate text-sm font-medium text-ink transition-colors hover:text-brand"
                        >
                          {conversation.title}
                        </Link>
                        <Badge tone="violet">{conversation.routingMode}</Badge>
                        {conversation.status === "archived" ? (
                          <Badge tone="neutral">archived</Badge>
                        ) : null}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-dim">
                        <span className="inline-flex items-center gap-1">
                          <FolderKanban className="size-3 text-faint" />
                          {conversation.projectName ?? "No project"}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <MessagesSquare className="size-3 text-faint" />
                          {conversation.messageCount ?? 0} messages
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Clock className="size-3 text-faint" />
                          updated{" "}
                          {formatRelative(
                            conversation.lastMessageAt ?? conversation.updatedAt,
                          )}
                        </span>
                        {account ? (
                          <span className="text-faint">
                            active {account.label} · {account.providerName}
                          </span>
                        ) : null}
                        <span className="text-faint" title={formatDateTime(conversation.createdAt)}>
                          created {formatDateTime(conversation.createdAt)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      size="xs"
                      variant="secondary"
                      onClick={() => navigate(`/workspace?conversation=${conversation.id}`)}
                    >
                      Open
                      <ArrowUpRight className="size-3.5" />
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => void rename(conversation)}
                      title="Rename conversation"
                      aria-label="Rename conversation"
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => void toggleArchive(conversation)}
                      title={conversation.status === "active" ? "Archive" : "Restore"}
                      aria-label={conversation.status === "active" ? "Archive" : "Restore"}
                    >
                      {conversation.status === "active" ? (
                        <Archive className="size-3.5" />
                      ) : (
                        <ArchiveRestore className="size-3.5" />
                      )}
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => void remove(conversation)}
                      title="Delete conversation"
                      aria-label="Delete conversation"
                      className="text-rose-300/80 hover:bg-rose-500/10 hover:text-rose-200"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}

function ThreadStat({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <Card className="flex items-center gap-3" padding="sm">
      <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg border", accent)}>
        {icon}
      </span>
      <div>
        <div className="font-display text-xl leading-none font-semibold text-ink">{value}</div>
        <div className="mt-1 text-[10px] font-semibold tracking-[0.08em] text-faint uppercase">
          {label}
        </div>
      </div>
    </Card>
  );
}
