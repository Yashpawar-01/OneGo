import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
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
  Select,
  Spinner,
  Textarea,
  formatNumber,
} from "../components/ui.js";

type CatalogModel = ProviderModel & { providerKind: string; providerName: string };

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
        targetProviderKind: providerKind || null,
        targetModelId: modelId || null,
      });
      setName("");
      setModelId("");
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
        title="Model Router"
        description="Choose how each request picks a model: manual, automatic by priority, or intelligent classification over the synced catalog. Rules are stored configuration; the chat engine currently routes per conversation mode."
        actions={
          <Button variant="secondary" onClick={load}>
            Refresh
          </Button>
        }
      />

      {error ? <ErrorBanner message={error} onRetry={load} /> : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-ink">Routing rules</h2>
          {loading && rules.length === 0 ? <Spinner label="Loading rules…" /> : null}
          {!loading && rules.length === 0 ? (
            <EmptyState
              title="No routing rules yet"
              description="Rules capture recurring routing intent. They are stored and editable; automatic application during chat is a later phase."
            />
          ) : (
            <ul className="divide-y divide-edge/70">
              {rules.map((rule) => (
                <li key={rule.id} className="py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm text-ink">{rule.name}</span>
                        <Badge tone={rule.enabled ? "good" : "neutral"}>
                          {rule.enabled ? "enabled" : "disabled"}
                        </Badge>
                        <Badge tone="info">{rule.mode}</Badge>
                      </div>
                      <div className="mt-0.5 text-xs text-dim">
                        Priority {rule.priority}
                        {rule.targetProviderKind ? ` · ${rule.targetProviderKind}` : ""}
                        {rule.targetModelId ? ` · ${rule.targetModelId}` : ""}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Select
                        aria-label="Rule mode"
                        value={rule.mode}
                        onChange={(event) => void changeRuleMode(rule, event.target.value)}
                        className="w-auto"
                      >
                        <option value="manual">manual</option>
                        <option value="automatic">automatic</option>
                        <option value="intelligent">intelligent</option>
                      </Select>
                      <Button size="sm" variant="ghost" onClick={() => void toggleRule(rule)}>
                        {rule.enabled ? "Disable" : "Enable"}
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => void removeRule(rule)}>
                        Delete
                      </Button>
                    </div>
                  </div>
                  {Object.keys(rule.conditions).length > 0 ? (
                    <pre className="mt-1 overflow-x-auto rounded bg-canvas/60 px-2 py-1 text-[10px] text-dim">
                      {JSON.stringify(rule.conditions)}
                    </pre>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={createRule} className="mt-4 space-y-3 border-t border-edge pt-4">
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
            <Button type="submit" variant="primary" size="sm" disabled={busy || !name.trim()}>
              {busy ? "Creating…" : "Create rule"}
            </Button>
          </form>
        </Card>

        <Card>
          <h2 className="mb-3 text-sm font-semibold text-ink">Intelligent routing preview</h2>
          <p className="mb-3 text-xs text-dim">
            Paste a representative prompt. OneGo classifies the task locally (no provider
            request) and ranks synced models by capability, context size, and list price.
          </p>
          <form onSubmit={runPreview} className="space-y-2">
            <Textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="e.g. Refactor this React component and explain the tradeoffs…"
              className="min-h-24"
            />
            <Button type="submit" variant="primary" size="sm" disabled={previewing || !prompt.trim()}>
              {previewing ? "Classifying…" : "Preview routing"}
            </Button>
          </form>

          {preview ? (
            <div className="mt-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-dim">
                <Badge tone="info">{preview.classification.type}</Badge>
                <span>
                  confidence {Math.round(preview.classification.confidence * 100)}%
                </span>
                {preview.classification.signals?.map((signal) => (
                  <span key={signal} className="rounded bg-white/[0.03] px-1.5 py-0.5">
                    {signal}
                  </span>
                ))}
              </div>
              {preview.recommendations.length === 0 ? (
                <p className="text-sm text-dim">
                  No synced models available. Connect and sync a provider first.
                </p>
              ) : (
                <ol className="space-y-2">
                  {preview.recommendations.map((recommendation) => (
                    <li
                      key={`${recommendation.providerKind}:${recommendation.modelId}`}
                      className="rounded-lg border border-edge bg-canvas/40 px-3 py-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-1">
                        <span className="text-sm text-ink">
                          {recommendation.displayName}
                          <span className="ml-1.5 text-xs text-dim">
                            {recommendation.providerName}
                          </span>
                        </span>
                        <span className="text-xs text-brand">
                          score {formatNumber(recommendation.score)}
                        </span>
                      </div>
                      <div className="mt-0.5 text-[11px] text-dim">
                        {recommendation.reasons.join(" · ")}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          ) : null}
        </Card>
      </div>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-ink">Synced model catalog</h2>
        {catalog.length === 0 ? (
          <p className="text-sm text-dim">
            No models synced yet. Connect a provider and press “Sync models”.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {providersInCatalog.map((provider) => (
              <div key={provider.kind} className="rounded-lg border border-edge p-3">
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-sm text-ink">{provider.name}</span>
                  <Badge tone="neutral">{provider.kind}</Badge>
                  <span className="text-[11px] text-dim">{provider.models.length} models</span>
                </div>
                <ul className="space-y-1 text-xs text-dim">
                  {provider.models.map((model) => (
                    <li key={model.id} className="flex flex-wrap items-center justify-between gap-1">
                      <span className="text-ink">{model.displayName}</span>
                      <span>
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
