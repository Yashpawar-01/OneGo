import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
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
  Select,
  Spinner,
  StatusBadge,
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
      <Badge tone={caps.streaming ? "good" : "neutral"}>
        {caps.streaming ? "streaming" : "no streaming"}
      </Badge>
      <Badge tone="neutral">{caps.integration}</Badge>
      <Badge tone={caps.usageReporting === "exact" ? "info" : "neutral"}>
        usage: {caps.usageReporting.replaceAll("_", " ")}
      </Badge>
    </>
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
  const [result, setResult] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const credentialKey = authMethod === "api_key" ? "apiKey" : authMethod === "oauth" ? "accessToken" : "token";

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
      setResult(
        response.validation.ok
          ? `Connected. ${response.validation.message ?? "Validation passed."}`
          : `Saved, but validation failed: ${response.validation.message ?? response.validation.status}`,
      );
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
        + Add account
      </Button>
    );
  }

  return (
    <form onSubmit={submit} className="mt-3 space-y-3 rounded-lg border border-edge bg-canvas/40 p-3">
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
        <Field label="Default model" hint="Optional. Leave blank to use provider default.">
          <Input
            value={defaultModel}
            onChange={(e) => setDefaultModel(e.target.value)}
            placeholder="e.g. gpt-4.1"
          />
        </Field>
      </div>
      {error ? <ErrorBanner message={error} /> : null}
      {result ? (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
          {result}
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
    <li className="py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-medium text-ink">{account.label}</span>
            <StatusBadge status={account.enabled ? account.status : "disabled"} />
            <Badge tone="neutral">{AUTH_LABELS[account.authMethod] ?? account.authMethod}</Badge>
            {account.credentialHint ? (
              <span className="text-[11px] text-dim">{account.credentialHint}</span>
            ) : null}
          </div>
          <div className="mt-0.5 text-xs text-dim">
            Priority {account.priority}
            {account.defaultModel ? ` · default ${account.defaultModel}` : ""}
            {" · validated "}
            {account.lastValidatedAt ? formatRelative(account.lastValidatedAt) : "never"}
            {account.statusMessage ? ` · ${account.statusMessage}` : ""}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button size="sm" variant="ghost" onClick={toggleEnabled} disabled={busy !== null}>
            {account.enabled ? "Disable" : "Enable"}
          </Button>
          <Button size="sm" variant="ghost" onClick={validate} disabled={busy !== null}>
            {busy === "validate" ? "Validating…" : "Validate"}
          </Button>
          <Button size="sm" variant="ghost" onClick={sync} disabled={busy !== null}>
            {busy === "sync" ? "Syncing…" : "Sync models"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => loadUsage(false)} disabled={busy !== null}>
            {busy === "usage" ? "Loading…" : "Usage"}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setEditing((v) => !v)}>
            Edit
          </Button>
          <Button size="sm" variant="danger" onClick={remove} disabled={busy !== null}>
            Delete
          </Button>
        </div>
      </div>

      {error ? (
        <div className="mt-2">
          <ErrorBanner message={error} />
        </div>
      ) : null}

      {editing ? (
        <form onSubmit={save} className="mt-3 grid gap-3 rounded-lg border border-edge bg-canvas/40 p-3 sm:grid-cols-3">
          <Field label="Label">
            <Input value={label} onChange={(e) => setLabel(e.target.value)} />
          </Field>
          <Field label="Priority">
            <Input type="number" min={0} value={priority} onChange={(e) => setPriority(e.target.value)} />
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
        <div className="mt-2 rounded-lg border border-edge bg-canvas/40 px-3 py-2 text-xs text-dim">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={usage.quota?.exhausted ? "bad" : usage.rateLimit?.limited ? "warn" : "good"}>
              {usage.reporting}
            </Badge>
            <span>source: {usage.source}</span>
            {usage.quota?.exhausted ? <span>quota exhausted</span> : null}
            {usage.rateLimit?.limited ? <span>rate limited</span> : null}
            {usage.tokens?.totalTokens !== undefined ? (
              <span>{usage.tokens.totalTokens.toLocaleString()} tokens</span>
            ) : null}
            <span>observed {formatDateTime(usage.observedAt)}</span>
            <button
              type="button"
              className="text-brand hover:underline"
              onClick={() => loadUsage(true)}
              disabled={busy !== null}
            >
              refresh
            </button>
          </div>
          {usage.note ? <p className="mt-1">{usage.note}</p> : null}
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Provider Accounts"
        description="Connect providers through their official APIs and SDKs. Credentials are encrypted at rest and never returned to the browser."
        actions={
          <Button variant="secondary" onClick={() => setNonce((v) => v + 1)}>
            Refresh
          </Button>
        }
      />

      {error ? <ErrorBanner message={error} onRetry={load} /> : null}
      {loading && providers.length === 0 ? <Spinner label="Loading providers…" /> : null}

      {!loading && totalAccounts === 0 ? (
        <EmptyState
          title="No provider accounts connected"
          description="Add at least one credential below. OpenAI and Anthropic use their HTTP APIs; GitHub Copilot and Qoder use official local tooling."
        />
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        {providers.map((provider) => (
          <Card key={provider.id}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-ink">{provider.name}</h2>
                  <Badge tone="info">{provider.kind}</Badge>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  {capabilityBadges(provider)}
                  <span className="text-[11px] text-dim">
                    {provider.models.length} models
                  </span>
                </div>
              </div>
              {provider.docsUrl ? (
                <a
                  href={provider.docsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-brand hover:underline"
                >
                  Official docs ↗
                </a>
              ) : null}
            </div>

            <div className="mt-3">
              {provider.accounts.length === 0 ? (
                <p className="text-sm text-dim">No accounts connected for this provider.</p>
              ) : (
                <ul className="divide-y divide-edge/70">
                  {provider.accounts.map((account) => (
                    <AccountRow
                      key={account.id}
                      account={account}
                      models={provider.models}
                      onChanged={() => setNonce((v) => v + 1)}
                    />
                  ))}
                </ul>
              )}
            </div>

            <AddAccountForm provider={provider} onCreated={() => setNonce((v) => v + 1)} />

            {provider.models.length > 0 ? (
              <details className="mt-3">
                <summary className="cursor-pointer text-xs text-dim hover:text-ink">
                  Available models
                </summary>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {provider.models.map((model) => (
                    <span
                      key={model.id}
                      title={[
                        model.contextWindow ? `${model.contextWindow.toLocaleString()} ctx` : null,
                        model.supportsTools ? "tools" : null,
                        model.supportsVision ? "vision" : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                      className="rounded border border-edge bg-white/[0.02] px-1.5 py-0.5 text-[11px] text-dim"
                    >
                      {model.displayName}
                    </span>
                  ))}
                </div>
              </details>
            ) : null}
          </Card>
        ))}
      </div>
    </div>
  );
}
