import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  api,
  ApiError,
  type Memory,
  type Project,
  type ProjectDetail,
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
  formatDateTime,
  formatRelative,
} from "../components/ui.js";

const TASK_STATUSES = ["pending", "in_progress", "blocked", "completed", "cancelled"];

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
      <Field label="Project name">
        <Input value={name} onChange={(event) => setName(event.target.value)} required />
      </Field>
      <Field label="Description">
        <Textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          className="min-h-16"
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Local root path" hint="Optional. Stored for reference only.">
          <Input
            value={rootPath}
            onChange={(event) => setRootPath(event.target.value)}
            placeholder="D:\\projects\\my-app"
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
      {error ? <ErrorBanner message={error} /> : null}
      <div className="flex gap-2">
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Projects"
        description="Group conversations and give every provider the same durable context: project memories, task state, and linked repositories."
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            New project
          </Button>
        }
      />

      {error ? <ErrorBanner message={error} onRetry={refresh} /> : null}

      {creating ? (
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-ink">New project</h2>
          <ProjectEditor
            onSaved={(project) => {
              setCreating(false);
              loadProjects(project.id);
            }}
            onCancel={() => setCreating(false)}
          />
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <Card className="p-3">
          <div className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-widest text-dim/70">
            Projects
          </div>
          {loading && projects.length === 0 ? <Spinner label="Loading…" /> : null}
          {!loading && projects.length === 0 ? (
            <p className="px-1 text-xs text-dim">
              No projects yet. Create one to attach persistent memory.
            </p>
          ) : (
            <ul className="space-y-0.5">
              {projects.map((project) => (
                <li key={project.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(project.id);
                      setEditing(false);
                    }}
                    className={[
                      "w-full rounded-md px-2 py-1.5 text-left text-xs",
                      project.id === selectedId
                        ? "bg-brand/10 text-brand"
                        : "text-dim hover:bg-white/5 hover:text-ink",
                    ].join(" ")}
                  >
                    <span className="block truncate">{project.name}</span>
                    <span className="mt-0.5 block text-[10px] text-dim/70">
                      {project.counts.conversations} chats · {project.counts.memories} memories ·{" "}
                      {project.counts.tasks} tasks
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-4">
          {!selectedId ? (
            <Card>
              <EmptyState
                title="No project selected"
                description="Select a project on the left, or create a new one."
              />
            </Card>
          ) : detailLoading && !detail ? (
            <Card>
              <Spinner label="Loading project…" />
            </Card>
          ) : detail ? (
            <>
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-sm font-semibold text-ink">{detail.project.name}</h2>
                      <Badge tone="neutral">
                        {detail.project.counts.conversations} conversations
                      </Badge>
                    </div>
                    <p className="mt-1 max-w-2xl text-xs text-dim">
                      {detail.project.description || "No description."}
                    </p>
                    <div className="mt-1 space-y-0.5 text-[11px] text-dim/80">
                      {detail.project.rootPath ? <div>root: {detail.project.rootPath}</div> : null}
                      {detail.project.gitRemoteUrl ? (
                        <div>remote: {detail.project.gitRemoteUrl}</div>
                      ) : null}
                      <div>created {formatRelative(detail.project.createdAt)}</div>
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="secondary" onClick={() => setEditing((v) => !v)}>
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => void deleteProject(detail.project)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
                {editing ? (
                  <div className="mt-4 border-t border-edge pt-4">
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
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-ink">Linked repositories</h2>
                  <span className="text-[11px] text-dim">
                    Indexing is not implemented in this build
                  </span>
                </div>
                {detail.repositories.length === 0 ? (
                  <p className="text-sm text-dim">
                    No repositories linked. Repository indexing and cross-provider context
                    injection arrive in a later phase.
                  </p>
                ) : (
                  <ul className="divide-y divide-edge/70 text-xs">
                    {detail.repositories.map((repository) => (
                      <li key={repository.id} className="flex flex-wrap gap-2 py-2">
                        <span className="text-ink">{repository.name}</span>
                        <span className="text-dim">{repository.path}</span>
                        <Badge tone="neutral">{repository.indexStatus}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <div className="grid gap-4 xl:grid-cols-2">
                <Card>
                  <h2 className="mb-1 text-sm font-semibold text-ink">Project memory</h2>
                  <p className="mb-3 text-xs text-dim">
                    Pinned memories are injected into every conversation in this project,
                    regardless of provider.
                  </p>
                  <form onSubmit={addMemory} className="space-y-2">
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
                    <label className="flex items-center gap-2 text-xs text-dim">
                      <input
                        type="checkbox"
                        checked={memoryPinned}
                        onChange={(event) => setMemoryPinned(event.target.checked)}
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

                  <ul className="mt-4 divide-y divide-edge/70">
                    {detail.memories.map((memory) => (
                      <li key={memory.id} className="py-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-xs font-medium text-ink">{memory.key}</span>
                            <Badge tone="neutral">{memory.category}</Badge>
                            {memory.pinned ? <Badge tone="info">pinned</Badge> : null}
                            <span className="text-[10px] text-dim/70">
                              v{memory.version} · {formatRelative(memory.updatedAt)}
                            </span>
                          </div>
                          <div className="flex gap-1.5">
                            <button
                              type="button"
                              onClick={() => void togglePin(memory)}
                              className="text-[11px] text-dim hover:text-ink"
                            >
                              {memory.pinned ? "unpin" : "pin"}
                            </button>
                            <button
                              type="button"
                              onClick={() => void deleteMemory(memory)}
                              className="text-[11px] text-rose-300 hover:text-rose-200"
                            >
                              delete
                            </button>
                          </div>
                        </div>
                        <p className="mt-1 whitespace-pre-wrap text-xs text-dim">{memory.value}</p>
                      </li>
                    ))}
                    {detail.memories.length === 0 ? (
                      <li className="py-2 text-xs text-dim">No memories stored yet.</li>
                    ) : null}
                  </ul>
                </Card>

                <Card>
                  <h2 className="mb-1 text-sm font-semibold text-ink">Task state</h2>
                  <p className="mb-3 text-xs text-dim">
                    Open tasks travel with the project context so every provider sees the same
                    plan.
                  </p>
                  <form onSubmit={addTask} className="space-y-2">
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

                  <ul className="mt-4 divide-y divide-edge/70">
                    {detail.tasks.map((task) => (
                      <li key={task.id} className="py-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-xs text-ink">{task.title}</span>
                              <Badge
                                tone={
                                  task.status === "completed"
                                    ? "good"
                                    : task.status === "blocked"
                                      ? "bad"
                                      : task.status === "in_progress"
                                        ? "warn"
                                        : "neutral"
                                }
                              >
                                {task.status}
                              </Badge>
                            </div>
                            {task.detail ? (
                              <p className="mt-0.5 whitespace-pre-wrap text-[11px] text-dim">
                                {task.detail}
                              </p>
                            ) : null}
                            <div className="mt-0.5 text-[10px] text-dim/70">
                              updated {formatDateTime(task.updatedAt)}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Select
                              aria-label="Task status"
                              value={task.status}
                              onChange={(event) => void changeTaskStatus(task, event.target.value)}
                              className="w-auto text-xs"
                            >
                              {TASK_STATUSES.map((status) => (
                                <option key={status} value={status}>
                                  {status}
                                </option>
                              ))}
                            </Select>
                            <button
                              type="button"
                              onClick={() => void deleteTask(task)}
                              className="text-[11px] text-rose-300 hover:text-rose-200"
                            >
                              delete
                            </button>
                          </div>
                        </div>
                      </li>
                    ))}
                    {detail.tasks.length === 0 ? (
                      <li className="py-2 text-xs text-dim">No tasks tracked yet.</li>
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
