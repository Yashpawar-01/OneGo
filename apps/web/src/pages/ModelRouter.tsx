import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  BrainCircuit,
  MousePointerClick,
  Power,
  RefreshCw,
  Sparkles,
  Trash2,
  Waypoints,
  Zap,
  type LucideIcon,
} from "lucide-react";
import {
  api,
  ApiError,
  type ProviderModel,
  type RoutingPreview,
  type RoutingRule,
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
  ProviderGlyph,
  Select,
  Spinner,
  Textarea,
  cn,
  formatNumber,
} from "../components/ui.js";

type CatalogModel = ProviderModel & { providerKind: string; providerName: string };

const MODE_COPY: Array<{
  mode: string;
  icon: LucideIcon;
  blurb: string;
  accent: string;
}> = [
  {
    mode: "manual",
    icon: MousePointerClick,
    blurb: "You pick provider and model per conversation.",
    accent: "border-brand/25 bg-brand/10 text-[#b9c3ff]",
  },
  {
    mode: "automatic",
    icon: Zap,
    blurb: "Highest-priority healthy account wins, with fallback.",
    accent: "border-cyan-400/25 bg-cyan-400/10 text-cyan-300",
  },
  {
    mode: "intelligent",
    icon: BrainCircuit,
    blurb: "Classifies the task locally, then ranks synced models.",
    accent: "border-[#b18cff]/25 bg-[#b18cff]/10 text-[#d8c6ff]",
  },
];

const TASK_TYPES = [
  "architecture",
  "debugging",
  "code_generation",
  "code_review",
  "large_repo_analysis",
  "documentation",
] as const;

const CONDITION_KEYS = new Set([
  "taskTypes",
  "promptIncludes",
  "promptMatches",
  "projectId",
  "hasProject",
  "minMessages",
  "maxMessages",
  "minPromptLength",
  "maxPromptLength",
]);

function summarizeConditions(conditions: Record<string, unknown>): string[] {
  const chips: string[] = [];
  const taskTypes = conditions.taskTypes;
  if (typeof taskTypes === "string") chips.push(`task: ${taskTypes}`);
  else if (Array.isArray(taskTypes)) chips.push(`task: ${taskTypes.join(" / ")}`);

  const includes = conditions.promptIncludes;
  if (typeof includes === "string") chips.push(`includes “${includes}”`);
  else if (Array.isArray(includes)) {
    chips.push(`includes ${includes.map((value) => `“${String(value)}”`).join(" / ")}`);
  }

  if (typeof conditions.promptMatches === "string") {
    chips.push(`matches /${conditions.promptMatches}/i`);
  }
  if (typeof conditions.projectId === "string") chips.push("project pinned");
  if (typeof conditions.hasProject === "boolean") {
    chips.push(conditions.hasProject ? "requires project" : "no project");
  }
  if (typeof conditions.minMessages === "number") {
    chips.push(`≥ ${conditions.minMessages} messages`);
  }
  if (typeof conditions.maxMessages === "number") {
    chips.push(`≤ ${conditions.maxMessages} messages`);
  }
  if (typeof conditions.minPromptLength === "number") {
    chips.push(`prompt ≥ ${conditions.minPromptLength} chars`);
  }
  if (typeof conditions.maxPromptLength === "number") {
    chips.push(`prompt ≤ ${conditions.maxPromptLength} chars`);
  }

  for (const key of Object.keys(conditions)) {
    if (!CONDITION_KEYS.has(key)) chips.push(`unsupported: ${key}`);
  }
  return chips;
}

export function ModelRouter() {
  const [rules, setRules] = useState<RoutingRule[]>([]);
  const [catalog, setCatalog] = useState<CatalogModel[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState("");
  const [mode, setMode] = useState("automatic");
  const [priority, setPriority] = useState("100");
  const [providerKind, setProviderKind] = useState("");
  const [modelId, setModelId] = useState("");
  const [taskType, setTaskType] = useState("");

  const [prompt, setPrompt] = useState("");
  const [preview, setPreview] = useState<RoutingPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([api.routing.list(), api.usage.catalog()])
      .then(([ruleResult, catalogResult]) => {
        setRules(ruleResult.rules);
        setCatalog(catalogResult.models);
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const providersInCatalog = useMemo(() => {
    const map = new Map<string, { kind: string; name: string; models: CatalogModel[] }>();
    for (const model of catalog) {
      const entry = map.get(model.providerKind) ?? {
        kind: model.providerKind,
        name: model.providerName,
        models: [],
      };
      entry.models.push(model);
      map.set(model.providerKind, entry);
    }
    return [...map.values()];
  }, [catalog]);

  const filteredModels = catalog.filter(
    (model) => !providerKind || model.providerKind === providerKind,
  );

  const createRule = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.routing.create({
        name: name.trim(),
        mode,
        priority: Number(priority) || 100,
        conditions: taskType ? { taskTypes: [taskType] } : {},
        targetProviderKind: providerKind || null,
        targetModelId: modelId || null,
      });
      setName("");
      setModelId("");
      setTaskType("");
      notifyDataChanged();
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const toggleRule = async (rule: RoutingRule) => {
    try {
      await api.routing.update(rule.id, { enabled: !rule.enabled });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err as Error).message);
    }
  };

  const changeRuleMode = async (rule: RoutingRule, next: string) => {
    try {
      await api.routing.update(rule.id, { mode: next });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err as Error).message);
    }
  };

  const removeRule = async (rule: RoutingRule) => {
    if (!window.confirm(`Delete routing rule "${rule.name}"?`)) return;
    try {
      await api.routing.remove(rule.id);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err as Error).message);
    }
  };

  const runPreview = async (event: FormEvent) => {
    event.preventDefault();
    if (!prompt.trim()) return;
    setPreviewing(true);
    setError(null);
    try {
      const result = await api.usage.preview(prompt.trim());
      setPreview(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err as Error).message);
    } finally {
      setPreviewing(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={
          <>
            <Waypoints className="size-3.5" />
            Adaptive dispatch
          </>
        }
        title="Model Router"
        description="Choose how each request picks a model: manual, automatic by priority, or intelligent classification over the synced catalog. Enabled rules are evaluated before every turn; the lowest-priority match scopes the provider and model, and an explicit account or model pick always wins."
        actions={
          <Button variant="secondary" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
            Refresh
          </Button>
        }
      />

      {error ? <ErrorBanner message={error} onRetry={load} /> : null}

      <section className="grid gap-3 md:grid-cols-3">
        {MODE_COPY.map((entry) => {
          const Icon = entry.icon;
          return (
            <Card key={entry.mode} className="group relative overflow-hidden">
              <div className="pointer-events-none absolute -top-12 -right-10 size-32 rounded-full bg-gradient-to-b from-white/[0.05] to-transparent blur-2xl" />
              <div className="relative flex items-start gap-3">
                <span
                  className={cn(
                    "grid size-9 shrink-0 place-items-center rounded-lg border",
                    entry.accent,
                  )}
                >
                  <Icon className="size-4" />
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-display text-sm font-semibold text-ink capitalize">
                      {entry.mode}
                    </span>
                    <Badge tone="neutral">mode</Badge>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-dim">{entry.blurb}</p>
                </div>
              </div>
            </Card>
          );
        })}
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <div className="mb-4 flex items-start justify-between gap-2">
            <div>
              <h2 className="font-display text-sm font-semibold text-ink">Routing rules</h2>
              <p className="mt-0.5 text-[11px] text-dim">
                Stored intent · {rules.length} {rules.length === 1 ? "rule" : "rules"} · lowest
                priority wins
              </p>
            </div>
            <Badge tone="info" dot>
              persisted
            </Badge>
          </div>

          {loading && rules.length === 0 ? <Spinner label="Loading rules…" /> : null}
          {!loading && rules.length === 0 ? (
            <EmptyState
              icon={<Waypoints className="size-5" />}
              title="No routing rules yet"
              description="Rules match task type, prompt text, project, or conversation size. The lowest-priority match steers the next turn; turns with an explicit account or model pick bypass rules."
            />
          ) : (
            <ul className="space-y-2">
              {rules.map((rule) => (
                <li
                  key={rule.id}
                  className="rounded-xl border border-edge/80 bg-canvas/35 p-3 transition-colors hover:border-edge-strong/80"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-medium text-ink">{rule.name}</span>
                        <Badge tone={rule.enabled ? "good" : "neutral"} dot>
                          {rule.enabled ? "enabled" : "disabled"}
                        </Badge>
                        <Badge tone="violet">{rule.mode}</Badge>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-dim">
                        <span className="rounded border border-edge bg-panel px-1.5 py-0.5 font-mono text-[10px] text-dim">
                          p{rule.priority}
                        </span>
                        {rule.targetProviderKind ? (
                          <span className="inline-flex items-center gap-1">
                            <ProviderGlyph kind={rule.targetProviderKind} size="sm" />
                            {rule.targetProviderKind}
                          </span>
                        ) : (
                          <span>any provider</span>
                        )}
                        {rule.targetModelId ? (
                          <span className="font-mono text-[10px] text-dim">
                            {rule.targetModelId}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Select
                        aria-label="Rule mode"
                        value={rule.mode}
                        onChange={(event) => void changeRuleMode(rule, event.target.value)}
                        className="h-7 w-auto py-0 text-[11px]"
                      >
                        <option value="manual">manual</option>
                        <option value="automatic">automatic</option>
                        <option value="intelligent">intelligent</option>
                      </Select>
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => void toggleRule(rule)}
                        title={rule.enabled ? "Disable rule" : "Enable rule"}
                        aria-label={rule.enabled ? "Disable rule" : "Enable rule"}
                      >
                        <Power className="size-3.5" />
                      </Button>
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => void removeRule(rule)}
                        title="Delete rule"
                        aria-label="Delete rule"
                        className="text-rose-300/80 hover:bg-rose-500/10 hover:text-rose-200"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                  {Object.keys(rule.conditions).length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {summarizeConditions(rule.conditions).map((chip, index) => (
                        <span
                          key={`${chip}-${index}`}
                          className="rounded-full border border-edge bg-canvas/60 px-2 py-0.5 font-mono text-[10px] text-dim"
                        >
                          {chip}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-2">
                      <Badge tone="neutral">matches any turn</Badge>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={createRule} className="mt-4 space-y-3 border-t border-edge pt-4">
            <div className="flex items-center gap-2">
              <Sparkles className="size-3.5 text-brand" />
              <h3 className="text-xs font-semibold tracking-[0.08em] text-dim uppercase">
                New rule
              </h3>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Rule name">
                <Input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Long-context reasoning"
                  required
                />
              </Field>
              <Field label="Mode">
                <Select value={mode} onChange={(event) => setMode(event.target.value)}>
                  <option value="manual">manual</option>
                  <option value="automatic">automatic</option>
                  <option value="intelligent">intelligent</option>
                </Select>
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Priority">
                <Input
                  type="number"
                  min={0}
                  value={priority}
                  onChange={(event) => setPriority(event.target.value)}
                />
              </Field>
              <Field label="Provider">
                <Select
                  value={providerKind}
                  onChange={(event) => {
                    setProviderKind(event.target.value);
                    setModelId("");
                  }}
                >
                  <option value="">Any</option>
                  {providersInCatalog.map((provider) => (
                    <option key={provider.kind} value={provider.kind}>
                      {provider.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Model">
                <Select value={modelId} onChange={(event) => setModelId(event.target.value)}>
                  <option value="">Provider default</option>
                  {filteredModels.map((model) => (
                    <option key={`${model.providerKind}:${model.id}`} value={model.id}>
                      {model.providerName} — {model.displayName}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Condition · task type"
                hint="Optional. Matched by the local classifier; empty means any task."
              >
                <Select value={taskType} onChange={(event) => setTaskType(event.target.value)}>
                  <option value="">Any task</option>
                  {TASK_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type.replaceAll("_", " ")}
                    </option>
                  ))}
                </Select>
              </Field>
              <p className="self-center rounded-lg border border-edge/60 bg-canvas/40 px-3 py-2 text-[10px] leading-relaxed text-faint">
                Priorities are ascending. If the targeted provider or model is unavailable, the
                rule is skipped and normal routing continues, so a stale rule never blocks chat.
              </p>
            </div>
            <Button type="submit" variant="primary" size="sm" disabled={busy || !name.trim()}>
              {busy ? "Creating…" : "Create rule"}
            </Button>
          </form>
        </Card>

        <Card className="flex flex-col">
          <div className="mb-3">
            <h2 className="font-display text-sm font-semibold text-ink">
              Intelligent routing preview
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-dim">
              Paste a representative prompt. OneGo classifies the task locally (no provider
              request) and ranks synced models by capability, context size, and list price.
            </p>
          </div>
          <form onSubmit={runPreview} className="space-y-2">
            <Textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="e.g. Refactor this React component and explain the tradeoffs…"
              className="min-h-24"
            />
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={previewing || !prompt.trim()}
            >
              <BrainCircuit className="size-3.5" />
              {previewing ? "Classifying…" : "Preview routing"}
            </Button>
          </form>

          {preview ? (
            <div className="mt-4 flex-1 space-y-3">
              <div className="rounded-xl border border-brand/20 bg-brand/[0.06] p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="info" dot>
                    {preview.classification.type}
                  </Badge>
                  <span className="text-[11px] text-dim">
                    confidence {Math.round(preview.classification.confidence * 100)}%
                  </span>
                </div>
                {preview.classification.signals?.length ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {preview.classification.signals.map((signal) => (
                      <span
                        key={signal}
                        className="rounded-full border border-edge bg-canvas/60 px-2 py-0.5 text-[10px] text-dim"
                      >
                        {signal}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
              {preview.recommendations.length === 0 ? (
                <p className="text-sm text-dim">
                  No synced models available. Connect and sync a provider first.
                </p>
              ) : (
                <ol className="space-y-2">
                  {preview.recommendations.map((recommendation, index) => (
                    <li
                      key={`${recommendation.providerKind}:${recommendation.modelId}`}
                      className="flex items-start gap-3 rounded-xl border border-edge/80 bg-canvas/35 px-3 py-2.5"
                    >
                      <span
                        className={cn(
                          "grid size-6 shrink-0 place-items-center rounded-md border font-mono text-[10px] font-semibold",
                          index === 0
                            ? "border-brand/35 bg-brand/15 text-[#b9c3ff]"
                            : "border-edge bg-panel text-dim",
                        )}
                      >
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-1">
                          <span className="flex min-w-0 items-center gap-1.5 text-sm text-ink">
                            <ProviderGlyph
                              kind={recommendation.providerKind ?? "unknown"}
                              size="sm"
                            />
                            <span className="truncate">{recommendation.displayName}</span>
                            <span className="text-[11px] text-dim">
                              {recommendation.providerName}
                            </span>
                          </span>
                          <span className="font-mono text-[11px] text-brand">
                            {formatNumber(recommendation.score)}
                          </span>
                        </div>
                        <div className="mt-1 text-[11px] leading-relaxed text-dim">
                          {recommendation.reasons.join(" · ")}
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          ) : (
            <div className="mt-4 flex-1 rounded-xl border border-dashed border-edge/70 px-4 py-8 text-center">
              <p className="text-xs text-dim">
                Recommendations appear here after a local classification pass.
              </p>
            </div>
          )}
        </Card>
      </div>

      <Card>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="font-display text-sm font-semibold text-ink">Synced model catalog</h2>
            <p className="mt-0.5 text-[11px] text-dim">
              {catalog.length} models across {providersInCatalog.length}{" "}
              {providersInCatalog.length === 1 ? "provider" : "providers"}
            </p>
          </div>
          <Badge tone="neutral">from provider sync</Badge>
        </div>
        {catalog.length === 0 ? (
          <EmptyState
            icon={<Sparkles className="size-5" />}
            title="No models synced yet"
            description="Connect a provider on the Providers page and press “Sync models” to populate the catalog."
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {providersInCatalog.map((provider) => (
              <div
                key={provider.kind}
                className="rounded-xl border border-edge/80 bg-canvas/30 p-3"
              >
                <div className="mb-2.5 flex items-center gap-2">
                  <ProviderGlyph kind={provider.kind} size="sm" />
                  <span className="text-sm font-medium text-ink">{provider.name}</span>
                  <Badge tone="neutral">{provider.kind}</Badge>
                  <span className="ml-auto text-[11px] text-dim">
                    {provider.models.length} models
                  </span>
                </div>
                <ul className="space-y-1">
                  {provider.models.map((model) => (
                    <li
                      key={model.id}
                      className="flex flex-wrap items-center justify-between gap-1 rounded-lg px-2 py-1 text-xs hover:bg-white/[0.03]"
                    >
                      <span className="text-ink">{model.displayName}</span>
                      <span className="font-mono text-[10px] text-dim">
                        {model.contextWindow
                          ? `${formatNumber(model.contextWindow)} ctx`
                          : "ctx n/a"}
                        {model.inputCostPerMTok !== undefined
                          ? ` · $${model.inputCostPerMTok}/M in`
                          : ""}
                        {model.outputCostPerMTok !== undefined
                          ? ` · $${model.outputCostPerMTok}/M out`
                          : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
