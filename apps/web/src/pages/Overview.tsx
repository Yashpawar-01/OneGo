import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Check,
  Circle,
  Clock,
  KeyRound,
  MessageSquare,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Waypoints,
  Zap,
} from "lucide-react";
import {
  api,
  type Overview as OverviewData,
  type UsageSummary,
} from "../lib/api.js";
import { useSession } from "../context/SessionContext.js";
import { notifyDataChanged } from "../lib/events.js";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  LinkButton,
  Progress,
  ProviderGlyph,
  Skeleton,
  Sparkline,
  Stat,
  StatusBadge,
  cn,
  formatNumber,
  formatRelative,
  formatTokens,
} from "../components/ui.js";

function toneFor(kind: string): "good" | "warn" | "bad" | "neutral" | "info" | "violet" {
  switch (kind) {
    case "openai":
      return "info";
    case "anthropic":
      return "warn";
    case "qoder":
      return "violet";
    default:
      return "neutral";
  }
}

const KNOWN_PROVIDERS = [
  { kind: "openai", label: "OpenAI" },
  { kind: "anthropic", label: "Anthropic" },
  { kind: "github-copilot", label: "Copilot" },
  { kind: "qoder", label: "Qoder" },
];

export function Overview() {
  const { user } = useSession();
  const [data, setData] = useState<OverviewData | null>(null);
  const [daily, setDaily] = useState<UsageSummary["byDay"]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback((showSpinner = true) => {
    if (showSpinner) setLoading(true);
    setError(null);
    Promise.all([api.overview(), api.usage.summary(7).catch(() => null)])
      .then(([result, usage]) => {
        setData(result);
        setDaily(usage?.byDay ?? []);
        setLoading(false);
        setRefreshing(false);
      })
      .catch((err: Error) => {
        setError(err.message);
        setLoading(false);
        setRefreshing(false);
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-56 w-full rounded-2xl" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-32 rounded-2xl" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (error && !data) return <ErrorBanner message={error} onRetry={() => load()} />;
  if (!data) return null;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const firstName = user?.name?.split(" ")[0];

  const onboardingSteps = [
    {
      done: data.onboarding.hasProviderAccounts,
      title: "Connect a provider account",
      body: "Add an API key for OpenAI or Anthropic, or connect Copilot / Qoder CLI.",
      to: "/providers",
      cta: "Manage accounts",
    },
    {
      done: data.onboarding.hasSyncedModels,
      title: "Sync available models",
      body: "Pull each provider's catalog so routing can pick the right model.",
      to: "/providers",
      cta: "Sync models",
    },
    {
      done: data.onboarding.hasConversations,
      title: "Start a conversation",
      body: "Ask anything. OneGo streams the reply and falls back automatically.",
      to: "/workspace",
      cta: "Open workspace",
    },
  ];
  const doneSteps = onboardingSteps.filter((step) => step.done).length;
  const progress = Math.round((doneSteps / onboardingSteps.length) * 100);

  const providerTiles = KNOWN_PROVIDERS.map((known) => {
    const accounts = data.providers.filter((provider) => provider.providerKind === known.kind);
    return {
      ...known,
      accounts: accounts.length,
      connected: accounts.filter(
        (account) =>
          account.enabled &&
          account.status.toLowerCase() === "connected" &&
          !(account.coolingDownUntil && new Date(account.coolingDownUntil).getTime() > Date.now()),
      ).length,
    };
  });
  const extraKinds = [
    ...new Set(
      data.providers
        .map((provider) => provider.providerKind)
        .filter((kind) => !KNOWN_PROVIDERS.some((known) => known.kind === kind)),
    ),
  ];
  for (const kind of extraKinds) {
    const accounts = data.providers.filter((provider) => provider.providerKind === kind);
    providerTiles.push({
      kind,
      label: accounts[0]?.providerName ?? kind,
      accounts: accounts.length,
      connected: accounts.filter(
        (account) => account.enabled && account.status.toLowerCase() === "connected",
      ).length,
    });
  }

  const dailyRequests =
    daily.length > 0 ? daily.map((day) => day.requests) : [0, 0, 0, 0, 0, 0, 0];
  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="page-enter space-y-5">
      <Card padding="none" glow className="overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_130%_at_0%_0%,rgba(124,140,255,0.16),transparent_58%)]" />
        <div className="pointer-events-none absolute -top-24 right-[18%] size-72 rounded-full bg-[#b18cff]/10 blur-[90px]" />
        <div className="relative grid gap-8 p-6 md:grid-cols-[1.35fr_1fr] md:p-8">
          <div className="flex flex-col justify-between gap-6">
            <div>
              <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold tracking-[0.16em] text-faint uppercase">
                <Clock className="size-3.5 text-brand" />
                {today}
                <span className="text-edge-strong">/</span>
                <span className="text-brand">Live workspace</span>
              </div>
              <h1 className="mt-3 font-display text-[clamp(1.9rem,3vw,2.6rem)] leading-[1.08] font-semibold tracking-[-0.025em]">
                <span className="text-gradient">
                  {greeting}
                  {firstName ? `, ${firstName}` : ""}.
                </span>
                <br />
                <span className="text-ink">Every provider, one cockpit.</span>
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-dim">
                Live platform state only — real connections, usage recorded by OneGo, and
                every automatic fallback. Nothing sampled, nothing simulated.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <LinkButton to="/workspace" variant="primary">
                <Sparkles className="size-4" />
                Open workspace
              </LinkButton>
              <Button
                variant="secondary"
                onClick={() => {
                  setRefreshing(true);
                  load(false);
                  notifyDataChanged();
                }}
                disabled={refreshing}
              >
                <RefreshCw className={cn("size-4", refreshing && "animate-spin")} />
                {refreshing ? "Refreshing…" : "Refresh"}
              </Button>
              <span className="ml-1 flex items-center gap-1.5 text-[11px] text-faint">
                <ShieldCheck className="size-3.5 text-emerald-400/80" />
                encrypted credentials · official channels
              </span>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-xl border border-edge/80 bg-canvas/45 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-ink">
                <Waypoints className="size-4 text-brand" />
                Provider network
              </div>
              <Badge tone={data.counts.connectedAccounts > 0 ? "good" : "warn"} dot>
                {data.counts.connectedAccounts}/{data.counts.accounts} live
              </Badge>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {providerTiles.map((tile) => (
                <div
                  key={tile.kind}
                  className="flex items-center gap-2.5 rounded-lg border border-edge/70 bg-panel/50 px-2.5 py-2"
                >
                  <div className="relative">
                    <ProviderGlyph kind={tile.kind} size="sm" />
                    <span
                      className={cn(
                        "absolute -right-0.5 -bottom-0.5 size-2 rounded-full border-2 border-panel",
                        tile.connected > 0 ? "bg-emerald-400" : "bg-faint",
                      )}
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-[11px] font-medium text-ink">{tile.label}</div>
                    <div className="text-[10px] text-faint">
                      {tile.accounts === 0
                        ? "not connected"
                        : `${tile.connected}/${tile.accounts} connected`}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <Link
              to="/providers"
              className="mt-3 flex items-center justify-between rounded-lg px-1 py-1 text-[11px] text-dim transition-colors hover:text-ink"
            >
              Manage provider accounts
              <ArrowUpRight className="size-3.5" />
            </Link>
          </div>
        </div>
      </Card>

      {error ? <ErrorBanner message={error} onRetry={() => load()} /> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Connected providers"
          value={`${data.counts.connectedAccounts}/${data.counts.accounts}`}
          icon={<KeyRound className="size-4" />}
          accent="brand"
          hint={
            data.counts.errorAccounts + data.counts.expiredAccounts > 0
              ? `${data.counts.errorAccounts} error · ${data.counts.expiredAccounts} expired`
              : "All accounts reachable"
          }
        />
        <Stat
          label="Requests · 7 days"
          value={formatNumber(data.usage7d.requests)}
          icon={<Activity className="size-4" />}
          accent="cyan"
          hint={
            data.usage7d.estimatedCostUsd === null
              ? "Cost not reported by providers"
              : `≈ $${data.usage7d.estimatedCostUsd.toFixed(4)} from list prices`
          }
          footer={<Sparkline values={dailyRequests} height={30} stroke="#4cc9f0" />}
        />
        <Stat
          label="Tokens · 7 days"
          value={formatTokens(data.usage7d.inputTokens + data.usage7d.outputTokens)}
          icon={<Zap className="size-4" />}
          accent="violet"
          hint={`${formatTokens(data.usage7d.inputTokens)} in · ${formatTokens(
            data.usage7d.outputTokens,
          )} out`}
        />
        <Stat
          label="Provider switches"
          value={formatNumber(data.counts.providerSwitches)}
          icon={<Waypoints className="size-4" />}
          accent="amber"
          hint="Automatic fallbacks recorded"
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.55fr_1fr]">
        <Card padding="none">
          <div className="flex items-center justify-between gap-3 border-b border-edge/70 px-5 py-4">
            <div>
              <h2 className="font-display text-sm font-semibold text-ink">Provider accounts</h2>
              <p className="mt-0.5 text-[11px] text-dim">
                Credentials are stored as encrypted ciphertext.
              </p>
            </div>
            <Link
              to="/providers"
              className="flex items-center gap-1 text-[11px] font-medium text-brand transition-opacity hover:opacity-80"
            >
              Manage <ArrowUpRight className="size-3.5" />
            </Link>
          </div>
          {data.providers.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={<KeyRound className="size-5" />}
                title="No accounts yet"
                description="Connect OpenAI, Anthropic, GitHub Copilot, or Qoder to start routing requests."
                action={
                  <LinkButton to="/providers" variant="primary" size="sm">
                    Connect a provider
                  </LinkButton>
                }
              />
            </div>
          ) : (
            <ul className="divide-y divide-edge/60 px-2 py-1">
              {data.providers.map((provider) => {
                const cooling = provider.coolingDownUntil
                  ? new Date(provider.coolingDownUntil).getTime() > Date.now()
                  : false;
                return (
                  <li
                    key={provider.accountId}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-white/[0.025]"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <ProviderGlyph kind={provider.providerKind} />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="truncate text-[13px] font-medium text-ink">
                            {provider.label}
                          </span>
                          <Badge tone={toneFor(provider.providerKind)}>
                            {provider.providerName}
                          </Badge>
                          <StatusBadge status={provider.enabled ? provider.status : "disabled"} />
                          {cooling ? <Badge tone="warn">cooling down</Badge> : null}
                        </div>
                        <div className="mt-0.5 text-[11px] text-faint">
                          Priority {provider.priority} · last used{" "}
                          {provider.lastUsedAt ? formatRelative(provider.lastUsedAt) : "never"}
                          {provider.statusMessage ? ` · ${provider.statusMessage}` : ""}
                        </div>
                      </div>
                    </div>
                    <ArrowUpRight className="size-4 shrink-0 text-faint" />
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card className="flex flex-col">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold text-ink">Getting started</h2>
            <Badge tone={doneSteps === onboardingSteps.length ? "good" : "info"}>
              {doneSteps}/{onboardingSteps.length}
            </Badge>
          </div>
          <p className="mt-1 text-[11px] text-dim">Three steps to a fully routed workspace.</p>
          <Progress
            value={progress}
            tone={doneSteps === onboardingSteps.length ? "emerald" : "brand"}
            className="mt-3"
          />
          <ul className="mt-4 flex-1 space-y-1">
            {onboardingSteps.map((step) => (
              <li
                key={step.title}
                className="flex items-start gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-white/[0.02]"
              >
                <span
                  className={cn(
                    "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border",
                    step.done
                      ? "border-emerald-400/35 bg-emerald-400/10 text-emerald-300"
                      : "border-edge bg-panel-2 text-faint",
                  )}
                >
                  {step.done ? <Check className="size-3.5" /> : <Circle className="size-3" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div
                    className={cn(
                      "text-[13px] font-medium",
                      step.done ? "text-dim line-through decoration-edge-strong" : "text-ink",
                    )}
                  >
                    {step.title}
                  </div>
                  {!step.done ? (
                    <>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-dim">{step.body}</p>
                      <Link
                        to={step.to}
                        className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-brand hover:opacity-80"
                      >
                        {step.cta} <ArrowRight className="size-3" />
                      </Link>
                    </>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card padding="none">
          <div className="flex items-center justify-between gap-3 border-b border-edge/70 px-5 py-4">
            <h2 className="font-display text-sm font-semibold text-ink">Recent conversations</h2>
            <Link
              to="/conversations"
              className="flex items-center gap-1 text-[11px] font-medium text-brand hover:opacity-80"
            >
              View all <ArrowUpRight className="size-3.5" />
            </Link>
          </div>
          {data.recentConversations.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-dim">
              No conversations yet. Your first prompt starts the history.
            </p>
          ) : (
            <ul className="divide-y divide-edge/60 px-2 py-1">
              {data.recentConversations.map((conversation) => (
                <li key={conversation.id}>
                  <Link
                    to={`/workspace?conversation=${conversation.id}`}
                    className="group flex items-center gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-white/[0.025]"
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-edge bg-panel-2 text-dim group-hover:text-brand">
                      <MessageSquare className="size-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-ink group-hover:text-brand">
                        {conversation.title}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-faint">
                        {conversation.projectName ?? "No project"} ·{" "}
                        {formatRelative(conversation.lastMessageAt ?? conversation.updatedAt)}
                      </span>
                    </span>
                    <ArrowUpRight className="size-4 shrink-0 text-faint opacity-0 transition-opacity group-hover:opacity-100" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card padding="none">
          <div className="flex items-center justify-between gap-3 border-b border-edge/70 px-5 py-4">
            <div>
              <h2 className="font-display text-sm font-semibold text-ink">Fallback history</h2>
              <p className="mt-0.5 text-[11px] text-dim">
                Quota, rate, and auth failures that rerouted a request.
              </p>
            </div>
            <Badge tone={data.recentSwitches.length > 0 ? "warn" : "neutral"}>
              {data.recentSwitches.length} recorded
            </Badge>
          </div>
          {data.recentSwitches.length === 0 ? (
            <div className="px-5 py-6">
              <EmptyState
                icon={<Waypoints className="size-5" />}
                title="No switches recorded"
                description="Fallbacks appear here when a provider hits a quota, rate limit, or auth error. OneGo never fabricates them."
              />
            </div>
          ) : (
            <ul className="space-y-1 px-4 py-3">
              {data.recentSwitches.map((item, index) => (
                <li key={item.id} className="relative flex gap-3 rounded-xl px-2 py-2.5">
                  {index < data.recentSwitches.length - 1 ? (
                    <span className="absolute top-9 bottom-[-0.4rem] left-[1.07rem] w-px bg-edge" />
                  ) : null}
                  <span className="relative mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border border-amber-400/30 bg-amber-400/10 text-amber-300">
                    <span className="size-1.5 rounded-full bg-amber-400" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-[12px] font-medium text-ink">
                        {item.conversationTitle}
                      </span>
                      <Badge tone="warn">{item.reason.replaceAll("_", " ")}</Badge>
                    </div>
                    <div className="mt-0.5 text-[11px] text-dim">
                      <span className="font-mono text-[10px]">{item.from}</span> →{" "}
                      <span className="font-mono text-[10px]">{item.to}</span> ·{" "}
                      {formatRelative(item.createdAt)}
                    </div>
                    {item.detail ? (
                      <div className="mt-0.5 truncate text-[10px] text-faint">{item.detail}</div>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
    </div>
  );
}
