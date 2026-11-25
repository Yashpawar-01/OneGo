import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  Database,
  FolderGit2,
  FolderKanban,
  GitBranch,
  ListChecks,
  MessagesSquare,
  Pencil,
  Pin,
  PinOff,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import {
  api,
  ApiError,
  type Memory,
  type Project,
  type ProjectDetail,
  type ProjectRepository,
  type RepositoryHit,
  type Task,
} from "../lib/api.js";
import { notifyDataChanged } from "../lib/events.js";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Field,
  Input,
  PageHeader,
  Select,
  Spinner,
  Textarea,
  cn,
  formatDateTime,
  formatRelative,
} from "../components/ui.js";

const TASK_STATUSES = ["pending", "in_progress", "blocked", "completed", "cancelled"];

function taskTone(status: string): "good" | "warn" | "bad" | "neutral" {
  if (status === "completed") return "good";
  if (status === "blocked") return "bad";
  if (status === "in_progress") return "warn";
  return "neutral";
}

function indexTone(status: string): "good" | "warn" | "bad" | "neutral" {
  if (status === "indexed") return "good";
  if (status === "indexing") return "warn";
  if (status === "failed") return "bad";
  return "neutral";
}

function ProjectEditor({
  project,
  onSaved,
  onCancel,
}: {
  project?: Project;
  onSaved: (project: Project) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(project?.name ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [rootPath, setRootPath] = useState(project?.rootPath ?? "");
  const [gitRemoteUrl, setGitRemoteUrl] = useState(project?.gitRemoteUrl ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = {
        name: name.trim(),
        description: description.trim() || null,
        rootPath: rootPath.trim() || null,
        gitRemoteUrl: gitRemoteUrl.trim() || null,
      };
      const result = project
        ? await api.projects.update(project.id, body)
        : await api.projects.create({
            name: body.name,
            description: body.description ?? undefined,
            rootPath: body.rootPath ?? undefined,
            gitRemoteUrl: body.gitRemoteUrl ?? undefined,
          });
      notifyDataChanged();
      onSaved(result.project);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Project name">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="OneGo"
            required
          />
        </Field>
        <Field label="Git remote URL">
          <Input
            value={gitRemoteUrl}
            onChange={(event) => setGitRemoteUrl(event.target.value)}
            placeholder="https://github.com/org/repo"
          />
        </Field>
      </div>
      <Field label="Description">
        <Textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="What this workspace is for and how providers should treat it."
          className="min-h-18"
        />
      </Field>
      <Field
        label="Local root path"
        hint="Optional. Used as the fallback index root when no repository path is linked."
      >
        <Input
          value={rootPath}
          onChange={(event) => setRootPath(event.target.value)}
          placeholder="D:\\projects\\my-app"
        />
      </Field>
      {error ? <ErrorBanner message={error} /> : null}
      <div className="flex gap-2 pt-1">
        <Button type="submit" variant="primary" size="sm" disabled={busy || !name.trim()}>
          {busy ? "Saving…" : project ? "Save project" : "Create project"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function Projects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [memoryKey, setMemoryKey] = useState("");
  const [memoryValue, setMemoryValue] = useState("");
  const [memoryCategory, setMemoryCategory] = useState("general");
  const [memoryPinned, setMemoryPinned] = useState(false);
  const [memoryBusy, setMemoryBusy] = useState(false);

  const [taskTitle, setTaskTitle] = useState("");
  const [taskDetail, setTaskDetail] = useState("");
  const [taskBusy, setTaskBusy] = useState(false);

  const [repoName, setRepoName] = useState("");
  const [repoPath, setRepoPath] = useState("");
  const [repoBranch, setRepoBranch] = useState("");
  const [repoBusy, setRepoBusy] = useState(false);
  const [indexingId, setIndexingId] = useState<string | null>(null);
  const [indexNote, setIndexNote] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchHits, setSearchHits] = useState<RepositoryHit[] | null>(null);

  const loadProjects = useCallback(
    (selectId?: string) => {
      setLoading(true);
      api.projects
        .list()
        .then((result) => {
          setProjects(result.projects);
          setSelectedId((current) => {
            const next = selectId ?? current;
            return next && result.projects.some((p) => p.id === next)
              ? next
              : (result.projects[0]?.id ?? null);
          });
          setLoading(false);
        })
        .catch((err: Error) => {
          setError(err.message);
          setLoading(false);
        });
    },
    [],
  );

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const loadDetail = useCallback((id: string) => {
    setDetailLoading(true);
    api.projects
      .get(id)
      .then((result) => {
        setDetail(result);
        setDetailLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message);
        setDetail(null);
        setDetailLoading(false);
      });
  }, []);

  useEffect(() => {
    setIndexNote(null);
    setSearchHits(null);
    setSearchQuery("");
    if (selectedId) loadDetail(selectedId);
    else setDetail(null);
  }, [selectedId, loadDetail]);

  const refresh = () => {
    loadProjects(selectedId ?? undefined);
    if (selectedId) loadDetail(selectedId);
  };

  const deleteProject = async (project: Project) => {
    if (!window.confirm(`Delete project "${project.name}"? Conversations stay but lose the link.`))
      return;
    try {
      await api.projects.remove(project.id);
      notifyDataChanged();
      setSelectedId(null);
      loadProjects();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err as Error).message);
    }
  };

  const addMemory = async (event: FormEvent) => {
    event.preventDefault();
    if (!detail) return;
    setMemoryBusy(true);
    setError(null);
    try {
      await api.projects.addMemory(detail.project.id, {
        key: memoryKey.trim(),
        value: memoryValue.trim(),
        category: memoryCategory.trim() || "general",
        pinned: memoryPinned,
      });
      setMemoryKey("");
      setMemoryValue("");
      setMemoryPinned(false);
      loadDetail(detail.project.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err as Error).message);
    } finally {
      setMemoryBusy(false);
    }
  };

  const togglePin = async (memory: Memory) => {
    try {
      await api.projects.updateMemory(memory.id, { pinned: !memory.pinned });
      if (selectedId) loadDetail(selectedId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err as Error).message);
    }
  };

  const deleteMemory = async (memory: Memory) => {
    if (!window.confirm(`Delete memory "${memory.key}"?`)) return;
    try {
      await api.projects.deleteMemory(memory.id);
      if (selectedId) loadDetail(selectedId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err as Error).message);
    }
  };

  const addTask = async (event: FormEvent) => {
    event.preventDefault();
    if (!detail) return;
    setTaskBusy(true);
    setError(null);
    try {
      await api.projects.addTask(detail.project.id, {
        title: taskTitle.trim(),
        detail: taskDetail.trim() || undefined,
      });
      setTaskTitle("");
      setTaskDetail("");
      loadDetail(detail.project.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err as Error).message);
    } finally {
      setTaskBusy(false);
    }
  };

  const changeTaskStatus = async (task: Task, status: string) => {
    try {
      await api.projects.updateTask(task.id, { status });
      if (selectedId) loadDetail(selectedId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err as Error).message);
    }
  };

  const deleteTask = async (task: Task) => {
    if (!window.confirm(`Delete task "${task.title}"?`)) return;
    try {
      await api.projects.deleteTask(task.id);
      if (selectedId) loadDetail(selectedId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err as Error).message);
    }
  };

  const addRepository = async (event: FormEvent) => {
    event.preventDefault();
    if (!detail) return;
    setRepoBusy(true);
    setError(null);
    try {
      await api.projects.addRepository(detail.project.id, {
        name: repoName.trim(),
        path: repoPath.trim(),
        branch: repoBranch.trim() || undefined,
      });
      setRepoName("");
      setRepoPath("");
      setRepoBranch("");
      loadDetail(detail.project.id);
      notifyDataChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err as Error).message);
    } finally {
      setRepoBusy(false);
    }
  };

  const indexRepository = async (repository: ProjectRepository) => {
    setIndexingId(repository.id);
    setError(null);
    setIndexNote(null);
    try {
      const result = await api.projects.indexRepository(repository.id);
      const stats = result.stats;
      setIndexNote(
        `Indexed ${stats.indexedFiles} of ${stats.files} files into ${stats.chunks} chunks` +
          (stats.skipped > 0 ? ` · skipped ${stats.skipped}` : "") +
          (stats.truncated ? " · truncated at the safety cap" : ""),
      );
      if (selectedId) loadDetail(selectedId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err as Error).message);
    } finally {
      setIndexingId(null);
    }
  };

  const deleteRepository = async (repository: ProjectRepository) => {
    if (!window.confirm(`Unlink repository "${repository.name}" and its index?`)) return;
    try {
      await api.projects.deleteRepository(repository.id);
      setIndexNote(null);
      setSearchHits(null);
      if (selectedId) loadDetail(selectedId);
      notifyDataChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err as Error).message);
    }
  };

  const searchCode = async (event: FormEvent) => {
    event.preventDefault();
    if (!detail || !searchQuery.trim()) return;
    setSearchBusy(true);
    setError(null);
    try {
      const result = await api.projects.searchRepository(
        detail.project.id,
        searchQuery.trim(),
      );
      setSearchHits(result.hits);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err as Error).message);
    } finally {
      setSearchBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={
          <>
            <FolderKanban className="size-3.5" />
            Shared context
          </>
        }
        title="Projects"
        description="Group conversations and give every provider the same durable context: project memories, task state, and lexically indexed repositories."
        actions={
          <Button variant="primary" size="sm" onClick={() => setCreating((value) => !value)}>
            <Plus className="size-3.5" />
            New project
          </Button>
        }
      />

      {error ? <ErrorBanner message={error} onRetry={refresh} /> : null}

      {creating ? (
        <Card className="border-brand/25 bg-[linear-gradient(180deg,rgba(167,139,250,0.06),transparent_65%)]">
          <div className="mb-4 flex items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-sm font-semibold text-ink">New project</h2>
              <p className="mt-0.5 text-[11px] text-dim">
                Project metadata is stored once and shared across every provider.
              </p>
            </div>
            <Badge tone="info">scaffold</Badge>
          </div>
          <ProjectEditor
            onSaved={(project) => {
              setCreating(false);
              loadProjects(project.id);
            }}
            onCancel={() => setCreating(false)}
          />
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[292px_minmax(0,1fr)]">
        <Card padding="none" className="h-fit overflow-hidden">
          <div className="flex items-center justify-between gap-2 border-b border-edge px-4 py-3">
            <span className="text-[11px] font-semibold tracking-[0.14em] text-dim uppercase">
              Projects
            </span>
            <Badge tone="neutral">{projects.length}</Badge>
          </div>
          {loading && projects.length === 0 ? (
            <div className="p-4">
              <Spinner label="Loading…" />
            </div>
          ) : null}
          {!loading && projects.length === 0 ? (
            <div className="px-4 py-6 text-xs leading-relaxed text-dim">
              No projects yet. Create one to attach persistent memory.
            </div>
          ) : (
            <ul className="space-y-1 p-2">
              {projects.map((project) => {
                const active = project.id === selectedId;
                return (
                  <li key={project.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(project.id);
                        setEditing(false);
                      }}
                      className={cn(
                        "relative w-full rounded-xl px-3 py-2.5 text-left transition-colors",
                        active
                          ? "border border-brand/25 bg-brand/[0.08]"
                          : "border border-transparent hover:bg-white/[0.035]",
                      )}
                    >
                      {active ? (
                        <span className="absolute top-2.5 bottom-2.5 left-0 w-0.5 rounded-full bg-brand" />
                      ) : null}
                      <span
                        className={cn(
                          "block truncate text-sm",
                          active ? "font-medium text-ink" : "text-dim",
                        )}
                      >
                        {project.name}
                      </span>
                      <span className="mt-1 flex items-center gap-2.5 text-[10px] text-faint">
                        <span className="inline-flex items-center gap-1">
                          <MessagesSquare className="size-3" />
                          {project.counts.conversations}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Database className="size-3" />
                          {project.counts.memories}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <ListChecks className="size-3" />
                          {project.counts.tasks}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <div className="space-y-4">
          {!selectedId ? (
            <Card>
              <EmptyState
                icon={<FolderKanban className="size-5" />}
                title="No project selected"
                description="Select a project on the left, or create a new one to give every provider the same context."
              />
            </Card>
          ) : detailLoading && !detail ? (
            <Card>
              <Spinner label="Loading project…" />
            </Card>
          ) : detail ? (
            <>
              <Card className="relative overflow-hidden">
                <div className="pointer-events-none absolute -top-24 right-0 size-56 rounded-full bg-brand/[0.08] blur-3xl" />
                <div className="relative flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-display text-xl font-semibold tracking-tight text-ink">
                        {detail.project.name}
                      </h2>
                      <Badge tone="info" dot>
                        {detail.project.counts.conversations} conversations
                      </Badge>
                    </div>
                    <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-dim">
                      {detail.project.description || "No description yet."}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-dim">
                      {detail.project.rootPath ? (
                        <span className="inline-flex max-w-full items-center gap-1.5 truncate rounded-lg border border-edge bg-canvas/50 px-2 py-1 font-mono">
                          <FolderGit2 className="size-3 shrink-0 text-faint" />
                          <span className="truncate">{detail.project.rootPath}</span>
                        </span>
                      ) : null}
                      {detail.project.gitRemoteUrl ? (
                        <span className="inline-flex max-w-full items-center gap-1.5 truncate rounded-lg border border-edge bg-canvas/50 px-2 py-1 font-mono">
                          <GitBranch className="size-3 shrink-0 text-faint" />
                          <span className="truncate">{detail.project.gitRemoteUrl}</span>
                        </span>
                      ) : null}
                      <span className="text-faint">
                        created {formatRelative(detail.project.createdAt)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setEditing((value) => !value)}
                    >
                      <Pencil className="size-3.5" />
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => void deleteProject(detail.project)}
                      aria-label="Delete project"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>

                <div className="relative mt-4 grid grid-cols-3 gap-2">
                  <ProjectCount
                    icon={<MessagesSquare className="size-3.5" />}
                    label="conversations"
                    value={detail.project.counts.conversations}
                  />
                  <ProjectCount
                    icon={<Database className="size-3.5" />}
                    label="memories"
                    value={detail.project.counts.memories}
                  />
                  <ProjectCount
                    icon={<ListChecks className="size-3.5" />}
                    label="tasks"
                    value={detail.project.counts.tasks}
                  />
                </div>

                {editing ? (
                  <div className="relative mt-4 border-t border-edge pt-4">
                    <ProjectEditor
                      project={detail.project}
                      onSaved={() => {
                        setEditing(false);
                        refresh();
                      }}
                      onCancel={() => setEditing(false)}
                    />
                  </div>
                ) : null}
              </Card>

              <Card>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="font-display text-sm font-semibold text-ink">
                      Linked repositories
                    </h2>
                    <p className="mt-0.5 text-[11px] text-dim">
                      Index text files locally; matching snippets join every provider's context.
                    </p>
                  </div>
                  <Badge tone="neutral">{detail.repositories.length}</Badge>
                </div>

                {detail.repositories.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-edge/70 px-4 py-5 text-center text-xs leading-relaxed text-dim">
                    No repositories linked. Add an absolute local path below, then index it to
                    give every provider lexical code context.
                  </div>
                ) : (
                  <ul className="space-y-1.5">
                    {detail.repositories.map((repository) => (
                      <li
                        key={repository.id}
                        className="rounded-lg border border-edge/70 bg-canvas/30 px-3 py-2 text-xs"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <FolderGit2 className="size-3.5 shrink-0 text-faint" />
                          <span className="text-ink">{repository.name}</span>
                          <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-dim">
                            {repository.path}
                          </span>
                          <Badge tone={indexTone(repository.indexStatus)} dot>
                            {repository.indexStatus}
                          </Badge>
                          <Button
                            size="xs"
                            variant="ghost"
                            onClick={() => void indexRepository(repository)}
                            disabled={indexingId === repository.id}
                          >
                            <RefreshCw
                              className={cn(
                                "size-3",
                                indexingId === repository.id && "animate-spin",
                              )}
                            />
                            {indexingId === repository.id ? "Indexing…" : "Index"}
                          </Button>
                          <Button
                            size="xs"
                            variant="danger"
                            onClick={() => void deleteRepository(repository)}
                            aria-label={`Unlink ${repository.name}`}
                          >
                            <Trash2 className="size-3" />
                          </Button>
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-3 pl-5 text-[10px] text-faint">
                          <span>{repository.chunkCount} chunks</span>
                          <span>
                            {repository.lastIndexedAt
                              ? `indexed ${formatRelative(repository.lastIndexedAt)}`
                              : "never indexed"}
                          </span>
                          {repository.branch ? <span>branch {repository.branch}</span> : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                {indexNote ? (
                  <p className="mt-2 rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-3 py-2 text-[11px] text-emerald-300">
                    {indexNote}
                  </p>
                ) : null}

                <form onSubmit={addRepository} className="mt-3 space-y-2.5 border-t border-edge/70 pt-3">
                  <div className="grid gap-2 sm:grid-cols-[160px_minmax(0,1fr)_120px]">
                    <Field label="Name">
                      <Input
                        value={repoName}
                        onChange={(event) => setRepoName(event.target.value)}
                        placeholder="my-app"
                        required
                      />
                    </Field>
                    <Field label="Absolute path">
                      <Input
                        value={repoPath}
                        onChange={(event) => setRepoPath(event.target.value)}
                        placeholder="D:\\projects\\my-app"
                        required
                      />
                    </Field>
                    <Field label="Branch">
                      <Input
                        value={repoBranch}
                        onChange={(event) => setRepoBranch(event.target.value)}
                        placeholder="main"
                      />
                    </Field>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="max-w-xl text-[10px] leading-relaxed text-faint">
                      Hidden files, .env, credential-like names, lockfiles, binaries,
                      dependency and build folders are never indexed. Snippets stay in your
                      database; no code is sent anywhere at index time.
                    </p>
                    <Button
                      type="submit"
                      size="sm"
                      variant="secondary"
                      disabled={repoBusy || !repoName.trim() || !repoPath.trim()}
                    >
                      <Plus className="size-3.5" />
                      {repoBusy ? "Linking…" : "Link repository"}
                    </Button>
                  </div>
                </form>

                {detail.repositories.some((repository) => repository.indexStatus === "indexed") ? (
                  <form onSubmit={searchCode} className="mt-3 border-t border-edge/70 pt-3">
                    <div className="flex gap-2">
                      <Input
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        placeholder="Search indexed code, e.g. quota_exhausted"
                        aria-label="Search indexed code"
                      />
                      <Button
                        type="submit"
                        size="sm"
                        variant="primary"
                        disabled={searchBusy || !searchQuery.trim()}
                      >
                        <Search className="size-3.5" />
                        {searchBusy ? "Searching…" : "Search"}
                      </Button>
                    </div>
                    {searchHits !== null ? (
                      searchHits.length === 0 ? (
                        <p className="mt-2 text-[11px] text-faint">
                          No lexical matches in the current index.
                        </p>
                      ) : (
                        <ul className="mt-2 space-y-1.5">
                          {searchHits.map((hit) => (
                            <li
                              key={hit.id}
                              className="overflow-hidden rounded-lg border border-edge/70 bg-canvas/40"
                            >
                              <div className="flex items-center justify-between gap-2 border-b border-edge/60 px-3 py-1.5">
                                <span className="truncate font-mono text-[10px] text-dim">
                                  {hit.path}:{hit.startLine}-{hit.endLine}
                                </span>
                                <span className="shrink-0 text-[10px] text-faint">
                                  score {hit.rank.toFixed(2)}
                                </span>
                              </div>
                              <pre className="scrollbar-thin max-h-32 overflow-auto px-3 py-2 font-mono text-[10px] leading-relaxed whitespace-pre-wrap text-ink/80">
                                {hit.content}
                              </pre>
                            </li>
                          ))}
                        </ul>
                      )
                    ) : null}
                  </form>
                ) : null}
              </Card>

              <div className="grid gap-4 xl:grid-cols-2">
                <Card>
                  <div className="mb-1 flex items-center gap-2">
                    <span className="grid size-7 place-items-center rounded-md border border-[#e879f9]/25 bg-[#e879f9]/10 text-[#f5d0fe]">
                      <Database className="size-3.5" />
                    </span>
                    <h2 className="font-display text-sm font-semibold text-ink">Project memory</h2>
                  </div>
                  <p className="mb-3 text-xs leading-relaxed text-dim">
                    Pinned memories are injected into every conversation in this project,
                    regardless of provider.
                  </p>
                  <form
                    onSubmit={addMemory}
                    className="space-y-2.5 rounded-xl border border-edge/70 bg-canvas/30 p-3"
                  >
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Field label="Key">
                        <Input
                          value={memoryKey}
                          onChange={(event) => setMemoryKey(event.target.value)}
                          placeholder="stack"
                          required
                        />
                      </Field>
                      <Field label="Category">
                        <Input
                          value={memoryCategory}
                          onChange={(event) => setMemoryCategory(event.target.value)}
                        />
                      </Field>
                    </div>
                    <Field label="Value">
                      <Textarea
                        value={memoryValue}
                        onChange={(event) => setMemoryValue(event.target.value)}
                        placeholder="React 19 + Vite + Tailwind, PostgreSQL via Prisma"
                        className="min-h-16"
                        required
                      />
                    </Field>
                    <label className="flex cursor-pointer items-center gap-2 text-xs text-dim">
                      <input
                        type="checkbox"
                        checked={memoryPinned}
                        onChange={(event) => setMemoryPinned(event.target.checked)}
                        className="accent-[#a78bfa]"
                      />
                      Pin this memory into every request
                    </label>
                    <Button
                      type="submit"
                      size="sm"
                      variant="primary"
                      disabled={memoryBusy || !memoryKey.trim() || !memoryValue.trim()}
                    >
                      {memoryBusy ? "Saving…" : "Add memory"}
                    </Button>
                  </form>

                  <ul className="mt-3 divide-y divide-edge/60">
                    {detail.memories.map((memory) => (
                      <li key={memory.id} className="py-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-mono text-xs font-medium text-ink">
                              {memory.key}
                            </span>
                            <Badge tone="neutral">{memory.category}</Badge>
                            {memory.pinned ? (
                              <Badge tone="info" dot>
                                pinned
                              </Badge>
                            ) : null}
                            <span className="text-[10px] text-faint">
                              v{memory.version} · {formatRelative(memory.updatedAt)}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              size="xs"
                              variant="ghost"
                              onClick={() => void togglePin(memory)}
                              title={memory.pinned ? "Unpin memory" : "Pin memory"}
                              aria-label={memory.pinned ? "Unpin memory" : "Pin memory"}
                            >
                              {memory.pinned ? (
                                <PinOff className="size-3.5" />
                              ) : (
                                <Pin className="size-3.5" />
                              )}
                            </Button>
                            <Button
                              size="xs"
                              variant="ghost"
                              onClick={() => void deleteMemory(memory)}
                              title="Delete memory"
                              aria-label="Delete memory"
                              className="text-rose-300/80 hover:bg-rose-500/10 hover:text-rose-200"
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                        </div>
                        <p className="mt-1 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-dim">
                          {memory.value}
                        </p>
                      </li>
                    ))}
                    {detail.memories.length === 0 ? (
                      <li className="py-3 text-xs text-dim">No memories stored yet.</li>
                    ) : null}
                  </ul>
                </Card>

                <Card>
                  <div className="mb-1 flex items-center gap-2">
                    <span className="grid size-7 place-items-center rounded-md border border-cyan-400/25 bg-cyan-400/10 text-cyan-300">
                      <ListChecks className="size-3.5" />
                    </span>
                    <h2 className="font-display text-sm font-semibold text-ink">Task state</h2>
                  </div>
                  <p className="mb-3 text-xs leading-relaxed text-dim">
                    Open tasks travel with the project context so every provider sees the same
                    plan.
                  </p>
                  <form
                    onSubmit={addTask}
                    className="space-y-2.5 rounded-xl border border-edge/70 bg-canvas/30 p-3"
                  >
                    <Field label="Task title">
                      <Input
                        value={taskTitle}
                        onChange={(event) => setTaskTitle(event.target.value)}
                        placeholder="Add usage analytics export"
                        required
                      />
                    </Field>
                    <Field label="Detail">
                      <Textarea
                        value={taskDetail}
                        onChange={(event) => setTaskDetail(event.target.value)}
                        className="min-h-14"
                      />
                    </Field>
                    <Button
                      type="submit"
                      size="sm"
                      variant="primary"
                      disabled={taskBusy || !taskTitle.trim()}
                    >
                      {taskBusy ? "Adding…" : "Add task"}
                    </Button>
                  </form>

                  <ul className="mt-3 divide-y divide-edge/60">
                    {detail.tasks.map((task) => (
                      <li key={task.id} className="py-2.5">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-xs text-ink">{task.title}</span>
                              <Badge tone={taskTone(task.status)}>{task.status}</Badge>
                            </div>
                            {task.detail ? (
                              <p className="mt-0.5 text-[11px] leading-relaxed whitespace-pre-wrap text-dim">
                                {task.detail}
                              </p>
                            ) : null}
                            <div className="mt-0.5 text-[10px] text-faint">
                              updated {formatDateTime(task.updatedAt)}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <Select
                              aria-label="Task status"
                              value={task.status}
                              onChange={(event) => void changeTaskStatus(task, event.target.value)}
                              className="h-7 w-auto py-0 text-[11px]"
                            >
                              {TASK_STATUSES.map((status) => (
                                <option key={status} value={status}>
                                  {status}
                                </option>
                              ))}
                            </Select>
                            <Button
                              size="xs"
                              variant="ghost"
                              onClick={() => void deleteTask(task)}
                              title="Delete task"
                              aria-label="Delete task"
                              className="text-rose-300/80 hover:bg-rose-500/10 hover:text-rose-200"
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                        </div>
                      </li>
                    ))}
                    {detail.tasks.length === 0 ? (
                      <li className="py-3 text-xs text-dim">No tasks tracked yet.</li>
                    ) : null}
                  </ul>
                </Card>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ProjectCount({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-edge/70 bg-canvas/35 px-3 py-2">
      <span className="grid size-7 place-items-center rounded-md border border-edge bg-panel text-dim">
        {icon}
      </span>
      <div>
        <div className="font-mono text-sm leading-none text-ink">{value}</div>
        <div className="mt-0.5 text-[10px] text-faint">{label}</div>
      </div>
    </div>
  );
}
