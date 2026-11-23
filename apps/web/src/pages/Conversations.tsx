import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
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
  Select,
  Spinner,
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
    const map = new Map<string, { label: string; providerName: string }>();
    for (const provider of providers) {
      for (const account of provider.accounts) {
        map.set(account.id, { label: account.label, providerName: provider.name });
      }
    }
    return map;
  }, [providers]);

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
        title="Conversations"
        description="Every thread keeps its message history, provider switches, and context snapshots so any provider can continue where another stopped."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Select
              aria-label="Status filter"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="w-auto"
            >
              <option value="active">Active</option>
              <option value="archived">Archived</option>
              <option value="all">All</option>
            </Select>
            <Select
              aria-label="Project filter"
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
              className="w-auto"
            >
              <option value="">All projects</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </Select>
            <Button variant="secondary" onClick={load}>
              Refresh
            </Button>
          </div>
        }
      />

      {error ? <ErrorBanner message={error} onRetry={load} /> : null}

      {loading && conversations.length === 0 ? (
        <Spinner label="Loading conversations…" />
      ) : conversations.length === 0 ? (
        <EmptyState
          title="No conversations in this view"
          description="Start a new conversation in the workspace, or change the filters above."
          action={
            <Button variant="primary" onClick={() => navigate("/workspace")}>
              Open workspace
            </Button>
          }
        />
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-edge/70">
            {conversations.map((conversation) => {
              const account = conversation.activeAccountId
                ? accountById.get(conversation.activeAccountId)
                : null;
              return (
                <li key={conversation.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Link
                        to={`/workspace?conversation=${conversation.id}`}
                        className="truncate text-sm font-medium text-ink hover:text-brand"
                      >
                        {conversation.title}
                      </Link>
                      <Badge tone="info">{conversation.routingMode}</Badge>
                      {conversation.status === "archived" ? (
                        <Badge tone="neutral">archived</Badge>
                      ) : null}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-dim">
                      <span>{conversation.projectName ?? "No project"}</span>
                      <span>· {conversation.messageCount ?? 0} messages</span>
                      <span>
                        · updated {formatRelative(conversation.lastMessageAt ?? conversation.updatedAt)}
                      </span>
                      {account ? (
                        <span>
                          · active {account.label} ({account.providerName})
                        </span>
                      ) : null}
                      <span>· created {formatDateTime(conversation.createdAt)}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => navigate(`/workspace?conversation=${conversation.id}`)}
                    >
                      Open
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => void rename(conversation)}>
                      Rename
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void toggleArchive(conversation)}
                    >
                      {conversation.status === "active" ? "Archive" : "Restore"}
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => void remove(conversation)}>
                      Delete
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
