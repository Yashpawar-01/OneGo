import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  CheckCircle2,
  ExternalLink,
  Gauge,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import {
  api,
  ApiError,
  type Account,
  type Provider,
  type UsageSnapshot,
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
  Skeleton,
  StatusBadge,
  cn,
  formatDateTime,
  formatRelative,
} from "../components/ui.js";

const AUTH_LABELS: Record<string, string> = {
  api_key: "API key",
  oauth: "OAuth token",
  cli_pat: "Personal access token",
};

const CREDENTIAL_LABELS: Record<string, string> = {
  openai: "OpenAI API key",
  anthropic: "Anthropic API key",
  "github-copilot": "GitHub personal access token (Copilot scope)",
  qoder: "Qoder personal access token",
};

const CREDENTIAL_HINTS: Record<string, string> = {
  openai: "Created at platform.openai.com → API keys. Stored encrypted; never shown again.",
  anthropic:
    "Created at console.anthropic.com → API keys. Stored encrypted; never shown again.",
  "github-copilot":
    "A GitHub token with Copilot access. Used through the official @github/copilot-sdk.",
  qoder:
    "Set QODER_PERSONAL_ACCESS_TOKEN on the server and paste the same token here. Executed via the Qoder CLI.",
};

function capabilityBadges(provider: Provider) {
  const caps = provider.capabilities;
  return (
    <>
      <Badge tone={caps.streaming ? "good" : "neutral"} dot>
        {caps.streaming ? "streaming" : "no streaming"}
      </Badge>
      <Badge tone="neutral">{caps.integration}</Badge>
      <Badge tone={caps.usageReporting === "exact" ? "info" : "neutral"}>
        usage: {caps.usageReporting.replaceAll("_", " ")}
      </Badge>
    </>
  );
}

function IconAction({
  label,
  onClick,
  icon,
  disabled,
  tone = "default",
}: {
  label: string;
  onClick: () => void;
  icon: ReactNode;
  disabled?: boolean;
  tone?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "grid size-7 place-items-center rounded-md border border-transparent text-dim transition-colors hover:border-edge hover:bg-white/[0.05] hover:text-ink disabled:pointer-events-none disabled:opacity-40",
        tone === "danger" &&
          "hover:border-rose-500/30 hover:bg-rose-500/10 hover:text-rose-200",
      )}
    >
      {icon}
    </button>
  );
}

function AddAccountForm({
  provider,
  onCreated,
}: {
  provider: Provider;
  onCreated: () => void;
}) {
  const defaultAuth = provider.authMethods[0] ?? "api_key";
  const [label, setLabel] = useState("default");
  const [authMethod, setAuthMethod] = useState(defaultAuth);
  const [secret, setSecret] = useState("");
  const [priority, setPriority] = useState("100");
  const [defaultModel, setDefaultModel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [open, setOpen] = useState(false);

  const credentialKey =
    authMethod === "api_key" ? "apiKey" : authMethod === "oauth" ? "accessToken" : "token";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const response = await api.providers.createAccount(provider.key, {
        label: label.trim() || "default",
        credentials: { [credentialKey]: secret.trim() },
        priority: Number(priority) || 100,
        defaultModel: defaultModel.trim() || undefined,
      });
      setResult({
        ok: response.validation.ok,
        message: response.validation.ok
          ? `Connected. ${response.validation.message ?? "Validation passed."}`
          : `Saved, but validation failed: ${
              response.validation.message ?? response.validation.status
            }`,
      });
      setSecret("");
      notifyDataChanged();
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <Plus className="size-3.5" />
        Add account
      </Button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="animate-fade-up space-y-3 rounded-xl border border-edge bg-canvas/40 p-4"
    >
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold text-ink">Connect {provider.name}</div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="grid size-6 place-items-center rounded-md text-faint hover:text-ink"
          aria-label="Close add account form"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Label">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="default" />
        </Field>
        <Field label="Auth method">
          <Select value={authMethod} onChange={(e) => setAuthMethod(e.target.value)}>
            {provider.authMethods.map((method) => (
              <option key={method} value={method}>
                {AUTH_LABELS[method] ?? method}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field
        label={CREDENTIAL_LABELS[provider.key] ?? "Credential"}
        hint={CREDENTIAL_HINTS[provider.key]}
      >
        <Input
          type="password"
          autoComplete="off"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          placeholder="Paste the secret"
          required
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Priority" hint="Lower number wins in automatic mode.">
          <Input
            type="number"
            min={0}
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
          />
        </Field>
        <Field label="Default model" hint="Optional. Blank uses the provider default.">
          <Input
            value={defaultModel}
            onChange={(e) => setDefaultModel(e.target.value)}
            placeholder="e.g. gpt-4.1"
          />
        </Field>
      </div>
      {error ? <ErrorBanner message={error} /> : null}
      {result ? (
        <div
          className={cn(
            "flex items-start gap-2 rounded-lg border px-3 py-2 text-xs",
            result.ok
              ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
              : "border-amber-400/30 bg-amber-400/10 text-amber-200",
          )}
        >
          <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" />
          {result.message}
        </div>
      ) : null}
      <div className="flex items-center gap-2">
        <Button type="submit" variant="primary" size="sm" disabled={busy || !secret.trim()}>
          {busy ? "Connecting…" : "Connect"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function AccountRow({
  account,
  models,
  onChanged,
}: {
  account: Account;
  models: Provider["models"];
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [usage, setUsage] = useState<UsageSnapshot | null>(null);
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(account.label);
  const [priority, setPriority] = useState(String(account.priority));
  const [defaultModel, setDefaultModel] = useState(account.defaultModel ?? "");

  const run = async (key: string, action: () => Promise<string | null>) => {
    setBusy(key);
    setError(null);
    try {
      const message = await action();
      notifyDataChanged();
      onChanged();
      return message;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err as Error).message);
      return null;
    } finally {
      setBusy(null);
    }
  };

  const toggleEnabled = () =>
    run("enable", async () => {
      await api.providers.updateAccount(account.id, { enabled: !account.enabled });
      return null;
    });

  const validate = () =>
    run("validate", async () => {
      const response = await api.providers.validateAccount(account.id);
      setError(response.validation.ok ? null : response.validation.message ?? "Validation failed");
      return null;
    });

  const sync = () =>
    run("sync", async () => {
      await api.providers.syncModels(account.id);
      return null;
    });

  const loadUsage = (refresh: boolean) =>
    run("usage", async () => {
      const response = await api.providers.accountUsage(account.id, refresh);
      setUsage(response.usage);
      return null;
    });

  const save = (event: FormEvent) => {
    event.preventDefault();
    return run("save", async () => {
      await api.providers.updateAccount(account.id, {
        label: label.trim() || account.label,
        priority: Number(priority) || account.priority,
        defaultModel: defaultModel.trim() || null,
      });
      setEditing(false);
      return null;
    });
  };

  const remove = () => {
    if (!window.confirm(`Delete account "${account.label}"? This cannot be undone.`)) return;
    void run("delete", async () => {
      await api.providers.deleteAccount(account.id);
      return null;
    });
  };

  return (
    <li className="rounded-xl border border-edge/80 bg-canvas/30 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[13px] font-medium text-ink">{account.label}</span>
            <StatusBadge status={account.enabled ? account.status : "disabled"} />
            <Badge tone="neutral">{AUTH_LABELS[account.authMethod] ?? account.authMethod}</Badge>
            {account.credentialHint ? (
              <span className="font-mono text-[10px] text-faint">{account.credentialHint}</span>
            ) : null}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-faint">
            <span>Priority {account.priority}</span>
            {account.defaultModel ? <span>· default {account.defaultModel}</span> : null}
            <span>
              · validated{" "}
              {account.lastValidatedAt ? formatRelative(account.lastValidatedAt) : "never"}
            </span>
            {account.statusMessage ? <span>· {account.statusMessage}</span> : null}
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          <IconAction
            label={account.enabled ? "Disable account" : "Enable account"}
            onClick={() => void toggleEnabled()}
            disabled={busy !== null}
            icon={<Power className="size-3.5" />}
          />
          <IconAction
            label="Validate credentials"
            onClick={() => void validate()}
            disabled={busy !== null}
            icon={
              busy === "validate" ? (
                <RefreshCw className="size-3.5 animate-spin" />
              ) : (
                <ShieldCheck className="size-3.5" />
              )
            }
          />
          <IconAction
            label="Sync models"
            onClick={() => void sync()}
            disabled={busy !== null}
            icon={
              <RefreshCw className={cn("size-3.5", busy === "sync" && "animate-spin")} />
            }
          />
          <IconAction
            label="Provider usage"
            onClick={() => void loadUsage(false)}
            disabled={busy !== null}
            icon={<Gauge className="size-3.5" />}
          />
          <IconAction
            label="Edit account"
            onClick={() => setEditing((value) => !value)}
            icon={<Pencil className="size-3.5" />}
          />
          <IconAction
            label="Delete account"
            onClick={remove}
            disabled={busy !== null}
            tone="danger"
            icon={<Trash2 className="size-3.5" />}
          />
        </div>
      </div>

      {error ? (
        <div className="mt-2">
          <ErrorBanner message={error} />
        </div>
      ) : null}

      {editing ? (
        <form
          onSubmit={save}
          className="animate-fade-up mt-3 grid gap-3 rounded-lg border border-edge bg-canvas/50 p-3 sm:grid-cols-3"
        >
          <Field label="Label">
            <Input value={label} onChange={(e) => setLabel(e.target.value)} />
          </Field>
          <Field label="Priority">
            <Input
              type="number"
              min={0}
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
            />
          </Field>
          <Field label="Default model">
            <Select value={defaultModel} onChange={(e) => setDefaultModel(e.target.value)}>
              <option value="">Provider default</option>
              {models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.displayName}
                </option>
              ))}
              {defaultModel && !models.some((model) => model.id === defaultModel) ? (
                <option value={defaultModel}>{defaultModel}</option>
              ) : null}
            </Select>
          </Field>
          <div className="flex items-center gap-2 sm:col-span-3">
            <Button type="submit" size="sm" variant="primary" disabled={busy !== null}>
              Save changes
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      {usage ? (
        <div className="animate-fade-up mt-2 rounded-lg border border-edge bg-canvas/50 px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-dim">
            <Badge
              tone={
                usage.quota?.exhausted ? "bad" : usage.rateLimit?.limited ? "warn" : "good"
              }
              dot
            >
              {usage.reporting.replaceAll("_", " ")}
            </Badge>
            <span className="text-faint">source: {usage.source}</span>
            {usage.quota?.exhausted ? <span className="text-rose-300">quota exhausted</span> : null}
            {usage.rateLimit?.limited ? (
              <span className="text-amber-300">rate limited</span>
            ) : null}
            {usage.tokens?.totalTokens !== undefined ? (
              <span>{usage.tokens.totalTokens.toLocaleString()} tokens</span>
            ) : null}
            <span className="text-faint">observed {formatDateTime(usage.observedAt)}</span>
            <button
              type="button"
              className="ml-auto text-[11px] font-medium text-brand hover:opacity-80"
              onClick={() => void loadUsage(true)}
              disabled={busy !== null}
            >
              Refresh
            </button>
          </div>
          {usage.note ? (
            <p className="mt-1 text-[10px] leading-relaxed text-faint">{usage.note}</p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

export function Providers() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api.providers
      .list()
      .then((result) => {
        setProviders(result.providers);
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    load();
  }, [load, nonce]);

  const totalAccounts = useMemo(
    () => providers.reduce((sum, provider) => sum + provider.accounts.length, 0),
    [providers],
  );
  const totalModels = useMemo(
    () => providers.reduce((sum, provider) => sum + provider.models.length, 0),
    [providers],
  );
  const connectedAccounts = useMemo(
    () =>
      providers.reduce(
        (sum, provider) =>
          sum +
          provider.accounts.filter(
            (account) => account.enabled && account.status.toLowerCase() === "connected",
          ).length,
        0,
      ),
    [providers],
  );

  return (
    <div className="page-enter space-y-5">
      <PageHeader
        eyebrow="Official channels"
        title="Provider accounts"
        description="Connect providers through their official APIs and SDKs. Credentials are encrypted at rest and never returned to the browser."
        actions={
          <Button
            variant="secondary"
            onClick={() => {
              setNonce((value) => value + 1);
              notifyDataChanged();
            }}
          >
            <RefreshCw className="size-4" />
            Refresh
          </Button>
        }
      />

      {error ? <ErrorBanner message={error} onRetry={load} /> : null}

      {loading && providers.length === 0 ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-64 rounded-2xl" />
          ))}
        </div>
      ) : null}

      {!loading && totalAccounts === 0 ? (
        <EmptyState
          icon={<ShieldCheck className="size-5" />}
          title="No provider accounts connected"
          description="Add at least one credential below. OpenAI and Anthropic use their HTTP APIs; GitHub Copilot and Qoder use official local tooling."
        />
      ) : null}

      {providers.length > 0 ? (
        <Card padding="none" className="overflow-hidden">
          <div className="grid divide-y divide-edge/70 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {[
              { label: "Providers available", value: providers.length },
              { label: "Accounts connected", value: `${connectedAccounts}/${totalAccounts}` },
              { label: "Models synced", value: totalModels },
            ].map((item) => (
              <div key={item.label} className="px-5 py-4">
                <div className="text-[10px] font-semibold tracking-[0.14em] text-faint uppercase">
                  {item.label}
                </div>
                <div className="mt-1 font-display text-xl font-semibold text-ink">
                  {item.value}
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        {providers.map((provider) => (
          <Card key={provider.id} padding="none" className="overflow-hidden">
            <div className="relative border-b border-edge/70 px-5 py-4">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_100%_at_0%_0%,rgba(167,139,250,0.07),transparent_70%)]" />
              <div className="relative flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <ProviderGlyph kind={provider.kind} size="lg" />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-display text-[15px] font-semibold text-ink">
                        {provider.name}
                      </h2>
                      <Badge tone="info">{provider.kind}</Badge>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {capabilityBadges(provider)}
                      <span className="text-[11px] text-faint">
                        {provider.models.length} models
                      </span>
                    </div>
                  </div>
                </div>
                {provider.docsUrl ? (
                  <a
                    href={provider.docsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-[11px] font-medium text-brand hover:opacity-80"
                  >
                    Official docs <ExternalLink className="size-3" />
                  </a>
                ) : null}
              </div>
            </div>

            <div className="space-y-3 p-4">
              {provider.accounts.length === 0 ? (
                <div className="rounded-xl border border-dashed border-edge-strong/70 px-4 py-5 text-center text-xs text-dim">
                  No accounts connected for this provider yet.
                </div>
              ) : (
                <ul className="space-y-2">
                  {provider.accounts.map((account) => (
                    <AccountRow
                      key={account.id}
                      account={account}
                      models={provider.models}
                      onChanged={() => setNonce((value) => value + 1)}
                    />
                  ))}
                </ul>
              )}

              <AddAccountForm
                provider={provider}
                onCreated={() => setNonce((value) => value + 1)}
              />

              {provider.models.length > 0 ? (
                <details className="group rounded-lg border border-edge/60 bg-canvas/30">
                  <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-[11px] text-dim transition-colors hover:text-ink [&::-webkit-details-marker]:hidden">
                    <span>Show synced models ({provider.models.length})</span>
                    <span className="text-faint transition-transform group-open:rotate-90">›</span>
                  </summary>
                  <div className="scrollbar-thin flex max-h-36 flex-wrap gap-1.5 overflow-y-auto border-t border-edge/60 px-3 py-2.5">
                    {provider.models.map((model) => (
                      <span
                        key={model.id}
                        title={[
                          model.contextWindow
                            ? `${model.contextWindow.toLocaleString()} ctx`
                            : null,
                          model.supportsTools ? "tools" : null,
                          model.supportsVision ? "vision" : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                        className="rounded border border-edge bg-white/[0.02] px-1.5 py-0.5 text-[10px] text-dim"
                      >
                        {model.displayName}
                      </span>
                    ))}
                  </div>
                </details>
              ) : null}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
