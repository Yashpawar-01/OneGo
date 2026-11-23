import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Overview as OverviewData } from "../lib/api.js";
import { notifyDataChanged } from "../lib/events.js";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  LinkButton,
  PageHeader,
  Spinner,
  Stat,
  StatusBadge,
  formatNumber,
  formatRelative,
  formatTokens,
} from "../components/ui.js";

function toneFor(kind: string): "good" | "warn" | "bad" | "neutral" | "info" {
  switch (kind) {
    case "openai":
    case "anthropic":
      return "info";
    case "qoder":
      return "warn";
    default:
      return "neutral";
  }
}

export function Overview() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api
      .overview()
      .then((result) => {
        setData(result);
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

  if (loading && !data) {
    return (
      <div className="py-10">
        <Spinner label="Loading workspace overview…" />
      </div>
    );
  }

  if (error && !data) {
    return <ErrorBanner message={error} onRetry={load} />;
  }

  if (!data) return null;

  const onboardingSteps = [
    {
      done: data.onboarding.hasProviderAccounts,
      title: "Connect a provider account",
      body: "Add an API key for OpenAI or Anthropic, or connect GitHub Copilot / Qoder CLI.",
      to: "/providers",
      cta: "Manage accounts",
    },
    {
      done: data.onboarding.hasSyncedModels,
      title: "Sync available models",
      body: "Pull the model catalog from each provider so routing can pick the right model.",
      to: "/providers",
      cta: "Sync models",
    },
    {
      done: data.onboarding.hasConversations,
      title: "Start a conversation",
      body: "Ask anything. OneGo streams from the best account and falls back automatically.",
      to: "/workspace",
      cta: "Open workspace",
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        description="Live platform state only — provider connections, usage recorded by OneGo, and fallback history. Nothing here is sampled or simulated."
        actions={
          <Button
            variant="secondary"
            onClick={() => {
              load();
              notifyDataChanged();
            }}
          >
            Refresh
          </Button>
        }
      />

      {error ? <ErrorBanner message={error} onRetry={load} /> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Connected providers"
          value={`${data.counts.connectedAccounts}/${data.counts.accounts}`}
          hint={
            data.counts.errorAccounts + data.counts.expiredAccounts > 0
              ? `${data.counts.errorAccounts} error · ${data.counts.expiredAccounts} expired`
              : "All accounts reachable"
          }
        />
        <Stat
          label="Requests (7 days)"
          value={formatNumber(data.usage7d.requests)}
          hint={
            data.usage7d.estimatedCostUsd === null
              ? "Cost not reported by providers"
              : `≈ $${data.usage7d.estimatedCostUsd.toFixed(4)} from list prices`
          }
        />
        <Stat
          label="Tokens (7 days)"
          value={formatTokens(data.usage7d.inputTokens + data.usage7d.outputTokens)}
          hint={`${formatTokens(data.usage7d.inputTokens)} in · ${formatTokens(
            data.usage7d.outputTokens,
          )} out`}
        />
        <Stat
          label="Provider switches"
          value={formatNumber(data.counts.providerSwitches)}
          hint="Automatic fallbacks recorded"
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink">Provider accounts</h2>
            <Link to="/providers" className="text-xs text-brand hover:underline">
              Manage
            </Link>
          </div>
          {data.providers.length === 0 ? (
            <EmptyState
              title="No accounts yet"
              description="Connect OpenAI, Anthropic, GitHub Copilot, or Qoder to start routing requests."
              action={<LinkButton to="/providers">Connect a provider</LinkButton>}
            />
          ) : (
            <ul className="divide-y divide-edge/70">
              {data.providers.map((provider) => {
                const cooling = provider.coolingDownUntil
                  ? new Date(provider.coolingDownUntil).getTime() > Date.now()
                  : false;
                return (
                  <li
                    key={provider.accountId}
                    className="flex flex-wrap items-center justify-between gap-2 py-2.5"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm text-ink">{provider.label}</span>
                        <Badge tone={toneFor(provider.providerKind)}>
                          {provider.providerName}
                        </Badge>
                        <StatusBadge status={provider.enabled ? provider.status : "disabled"} />
                        {cooling ? <Badge tone="warn">cooling down</Badge> : null}
                      </div>
                      <div className="mt-0.5 text-xs text-dim">
                        Priority {provider.priority} · last used{" "}
                        {provider.lastUsedAt ? formatRelative(provider.lastUsedAt) : "never"}
                        {provider.statusMessage ? ` · ${provider.statusMessage}` : ""}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="mb-3 text-sm font-semibold text-ink">Getting started</h2>
          <ul className="space-y-3">
            {onboardingSteps.map((step) => (
              <li key={step.title} className="flex items-start gap-3">
                <span
                  className={[
                    "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border text-[10px] font-bold",
                    step.done
                      ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                      : "border-edge text-dim",
                  ].join(" ")}
                >
                  {step.done ? "✓" : ""}
                </span>
                <div className="min-w-0">
                  <div className="text-sm text-ink">{step.title}</div>
                  <p className="text-xs text-dim">{step.body}</p>
                  {!step.done ? (
                    <Link
                      to={step.to}
                      className="mt-1 inline-block text-xs text-brand hover:underline"
                    >
                      {step.cta} →
                    </Link>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink">Recent conversations</h2>
            <Link to="/conversations" className="text-xs text-brand hover:underline">
              View all
            </Link>
          </div>
          {data.recentConversations.length === 0 ? (
            <p className="text-sm text-dim">No conversations yet.</p>
          ) : (
            <ul className="divide-y divide-edge/70">
              {data.recentConversations.map((conversation) => (
                <li key={conversation.id} className="py-2.5">
                  <Link
                    to={`/workspace?conversation=${conversation.id}`}
                    className="text-sm text-ink hover:text-brand"
                  >
                    {conversation.title}
                  </Link>
                  <div className="mt-0.5 text-xs text-dim">
                    {conversation.projectName ?? "No project"} ·{" "}
                    {formatRelative(conversation.lastMessageAt ?? conversation.updatedAt)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="mb-3 text-sm font-semibold text-ink">Fallback history</h2>
          {data.recentSwitches.length === 0 ? (
            <p className="text-sm text-dim">
              No provider switches yet. Fallbacks appear here whenever a provider hits a
              quota, rate limit, or authentication error.
            </p>
          ) : (
            <ul className="divide-y divide-edge/70">
              {data.recentSwitches.map((item) => (
                <li key={item.id} className="py-2.5">
                  <div className="flex flex-wrap items-center gap-1.5 text-sm text-ink">
                    <span className="truncate">{item.conversationTitle}</span>
                    <Badge tone="warn">{item.reason}</Badge>
                  </div>
                  <div className="mt-0.5 text-xs text-dim">
                    {item.from} → {item.to} · {formatRelative(item.createdAt)}
                  </div>
                  {item.detail ? (
                    <div className="text-xs text-dim/80">{item.detail}</div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
    </div>
  );
}
