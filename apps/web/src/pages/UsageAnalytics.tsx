import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  DollarSign,
  Gauge,
  Minus,
  RefreshCw,
  Waypoints,
} from "lucide-react";
import {
  api,
  type UsageAccounts,
  type UsageSummary,
} from "../lib/api.js";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  PageHeader,
  ProviderGlyph,
  SegmentedControl,
  Skeleton,
  Stat,
  StatusBadge,
  cn,
  formatCost,
  formatNumber,
  formatRelative,
  formatTokens,
} from "../components/ui.js";

const RANGES = [1, 7, 14, 30, 90] as const;

function share(value: number, max: number): number {
  if (max <= 0 || value <= 0) return 0;
  return Math.max(3, Math.round((value / max) * 100));
}

function changePercent(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

export function UsageAnalytics() {
  const [days, setDays] = useState(7);
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [accounts, setAccounts] = useState<UsageAccounts | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([api.usage.summary(days), api.usage.accounts()])
      .then(([summaryResult, accountResult]) => {
        setSummary(summaryResult);
        setAccounts(accountResult);
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message);
        setLoading(false);
      });
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  const maxDayRequests = Math.max(1, ...(summary?.byDay.map((day) => day.requests) ?? []));
  const maxProviderRequests = Math.max(
    1,
    ...(summary?.byProvider.map((row) => row.requests) ?? []),
  );
  const maxModelRequests = Math.max(1, ...(summary?.byModel.map((row) => row.requests) ?? []));

  const sourceBadges = useMemo(
    () => Object.entries(summary?.totals.sources ?? {}).sort((a, b) => b[1] - a[1]),
    [summary],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={
          <>
            <Waypoints className="size-3.5" />
            Recorded events
          </>
        }
        title="Usage Analytics"
        description="Every number below comes from UsageEvents recorded by OneGo when a provider actually answered. Missing data is shown as not reported — never estimated silently."
        actions={
          <>
            <SegmentedControl
              ariaLabel="Usage window"
              size="sm"
              value={String(days)}
              onChange={(next) => setDays(Number(next))}
              options={RANGES.map((range) => ({
                value: String(range),
                label: `${range}d`,
              }))}
            />
            <Button variant="secondary" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
              Refresh
            </Button>
          </>
        }
      />

      {error ? <ErrorBanner message={error} onRetry={load} /> : null}

      {summary ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat
              label="Requests"
              value={formatNumber(summary.totals.requests)}
              icon={<Activity className="size-4" />}
              accent="brand"
              delta={
                <TrendChip
                  delta={changePercent(
                    summary.totals.requests,
                    summary.previous.requests,
                  )}
                  title={`Compared with the previous ${summary.range.days} days`}
                />
              }
              hint={`${formatNumber(summary.totals.success)} success · ${formatNumber(
                summary.totals.errors,
              )} failed`}
            />
            <Stat
              label="Success rate"
              value={
                summary.totals.successRate === null
                  ? "—"
                  : `${Math.round(summary.totals.successRate * 100)}%`
              }
              icon={<CheckCircle2 className="size-4" />}
              accent="emerald"
              delta={
                <TrendChip
                  delta={
                    summary.totals.successRate === null ||
                    summary.previous.successRate === null
                      ? null
                      : Math.round(
                          (summary.totals.successRate - summary.previous.successRate) * 100,
                        )
                  }
                  unit="pts"
                  title={`Compared with the previous ${summary.range.days} days`}
                />
              }
              hint={
                summary.totals.successRate === null
                  ? "No completed calls in this window"
                  : `${days}-day window`
              }
            />
            <Stat
              label="Input tokens"
              value={formatTokens(summary.totals.inputTokens)}
              icon={<Gauge className="size-4" />}
              accent="cyan"
              delta={
                <TrendChip
                  delta={changePercent(
                    summary.totals.inputTokens,
                    summary.previous.inputTokens,
                  )}
                  title={`Compared with the previous ${summary.range.days} days`}
                />
              }
              hint="Only where providers report usage"
            />
            <Stat
              label="Estimated cost"
              value={formatCost(summary.totals.estimatedCostUsd)}
              icon={<DollarSign className="size-4" />}
              accent="amber"
              delta={
                <TrendChip
                  delta={
                    summary.totals.estimatedCostUsd === null ||
                    summary.previous.estimatedCostUsd === null
                      ? null
                      : changePercent(
                          summary.totals.estimatedCostUsd,
                          summary.previous.estimatedCostUsd,
                        )
                  }
                  title={`Compared with the previous ${summary.range.days} days`}
                />
              }
              hint="List-price estimate, blank when unpriced"
            />
          </section>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
            <Card>
              <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-sm font-semibold text-ink">Requests by day</h2>
                  <p className="mt-1 text-xs text-dim">
                    Complete responses only · {days === 1 ? "last 24 hours" : `last ${days} days`}
                  </p>
                </div>
              <div className="flex flex-wrap items-center gap-2">
                <Legend swatch="bg-[linear-gradient(180deg,#93a2ff,#6f7ff2)]" label="success" />
                {summary.totals.errors > 0 ? (
                  <Legend swatch="bg-rose-400/80" label="failed" />
                ) : null}
                {sourceBadges.map(([source, count]) => (
                  <Badge key={source} tone="neutral">
                    {source}: {formatNumber(count)}
                  </Badge>
                ))}
              </div>
            </div>
            {summary.byDay.length === 0 ? (
              <EmptyState
                icon={<Activity className="size-5" />}
                title="No usage recorded in this window"
                description="Send a message in the workspace. Usage rows appear only after a provider responds."
              />
            ) : (
              <DayChart days={summary.byDay} maxRequests={maxDayRequests} />
            )}
            </Card>

            <div className="grid gap-4">
              <Card>
                <CardHeading
                  title="Status distribution"
                  count={summary.totals.requests}
                  hint="Completed calls in this window"
                />
                {summary.totals.requests === 0 ? (
                  <QuietLine>No requests recorded in this window.</QuietLine>
                ) : (
                  <StatusDonut
                    success={summary.totals.success}
                    failed={summary.totals.errors}
                  />
                )}
              </Card>

              <Card>
                <CardHeading
                  title="Reliability by provider"
                  count={summary.byProvider.length}
                  hint="Successful share of recorded calls"
                />
                {summary.byProvider.length === 0 ? (
                  <QuietLine>No provider activity in this window.</QuietLine>
                ) : (
                  <ReliabilityRows providers={summary.byProvider} />
                )}
              </Card>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeading
                title="By provider"
                count={summary.byProvider.length}
                hint="Where each request was served"
              />
              {summary.byProvider.length === 0 ? (
                <QuietLine>No provider activity in this window.</QuietLine>
              ) : (
                <div className="divide-y divide-edge/60">
                  {summary.byProvider.map((row) => (
                    <div
                      key={row.providerKind}
                      className="flex items-center gap-3 py-3 first:pt-1 last:pb-1"
                    >
                      <ProviderGlyph kind={row.providerKind} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm text-ink">{row.name}</span>
                          <span className="font-mono text-xs text-ink">
                            {formatNumber(row.requests)}
                          </span>
                        </div>
                        <div className="mt-1.5 flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.05]">
                            <div
                              className="h-full rounded-full bg-[linear-gradient(90deg,#93a2ff,#6f7ff2)]"
                              style={{ width: `${share(row.requests, maxProviderRequests)}%` }}
                            />
                          </div>
                          <span className="w-24 shrink-0 text-right font-mono text-[11px] text-dim">
                            {formatTokens(row.inputTokens + row.outputTokens)} tok
                          </span>
                          <span className="w-20 shrink-0 text-right font-mono text-[11px] text-dim">
                            {formatCost(row.costUsd)}
                          </span>
                          {row.errors > 0 ? <Badge tone="bad">{row.errors} err</Badge> : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card>
              <CardHeading
                title="By model"
                count={summary.byModel.length}
                hint="Model ids as reported by providers"
              />
              {summary.byModel.length === 0 ? (
                <QuietLine>No model activity in this window.</QuietLine>
              ) : (
                <div className="divide-y divide-edge/60">
                  {summary.byModel.map((row) => (
                    <div key={row.modelId} className="py-3 first:pt-1 last:pb-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-mono text-xs text-ink">{row.modelId}</span>
                        <span className="font-mono text-xs text-ink">
                          {formatNumber(row.requests)}
                        </span>
                      </div>
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.05]">
                          <div
                            className="h-full rounded-full bg-[linear-gradient(90deg,#b18cff,#7c8cff)]"
                            style={{ width: `${share(row.requests, maxModelRequests)}%` }}
                          />
                        </div>
                        <span className="w-24 shrink-0 text-right font-mono text-[11px] text-dim">
                          {formatTokens(row.inputTokens + row.outputTokens)} tok
                        </span>
                        <span className="w-20 shrink-0 text-right font-mono text-[11px] text-dim">
                          {formatCost(row.costUsd)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          <section className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="font-display text-sm font-semibold text-ink">
                  Provider-reported quotas
                </h2>
                <p className="mt-1 max-w-2xl text-xs leading-relaxed text-dim">
                  Quotas are fetched from each provider&apos;s official channel when available.
                  Copilot and Qoder do not expose token meters, so their token usage is
                  intentionally blank.
                </p>
              </div>
              <Badge tone="info" dot>
                official channels only
              </Badge>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              {(accounts?.accounts ?? []).map((entry) => {
                const status = entry.account.enabled ? entry.account.status : "disabled";
                const quotaState = entry.usage.quota?.exhausted
                  ? "bad"
                  : entry.usage.rateLimit?.limited
                    ? "warn"
                    : "good";
                return (
                  <Card key={entry.account.id} className="relative overflow-hidden">
                    <div className="flex items-start gap-3">
                      <ProviderGlyph kind={entry.account.providerKind} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="truncate text-sm font-semibold text-ink">
                            {entry.account.label}
                          </span>
                          <StatusBadge status={status} />
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <Badge tone="neutral">{entry.account.providerName}</Badge>
                          <Badge tone={quotaState} dot>
                            {entry.usage.reporting.replaceAll("_", " ")}
                          </Badge>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl border border-edge/70 bg-canvas/40 p-3">
                      <MiniMetric
                        label="7d requests"
                        value={formatNumber(entry.last7Days.requests)}
                      />
                      <MiniMetric
                        label="7d tokens"
                        value={formatTokens(
                          entry.last7Days.inputTokens + entry.last7Days.outputTokens,
                        )}
                      />
                      <MiniMetric
                        label="7d cost"
                        value={formatCost(entry.last7Days.estimatedCostUsd)}
                      />
                    </div>

                    {entry.usage.quota || entry.usage.rateLimit || entry.usage.tokens ? (
                      <div className="mt-3 space-y-1.5">
                        {entry.usage.quota ? (
                          <QuotaLine
                            label="quota"
                            ok={!entry.usage.quota.exhausted}
                            okText="available"
                            badText="exhausted"
                            resetAt={entry.usage.quota.resetAt}
                          />
                        ) : null}
                        {entry.usage.rateLimit ? (
                          <QuotaLine
                            label="rate limit"
                            ok={!entry.usage.rateLimit.limited}
                            okText="clear"
                            badText="limited"
                            resetAt={entry.usage.rateLimit.resetAt}
                          />
                        ) : null}
                        {entry.usage.tokens?.totalTokens !== undefined ? (
                          <div className="flex items-center justify-between gap-2 text-[11px]">
                            <span className="text-faint">metered tokens</span>
                            <span className="font-mono text-dim">
                              {formatNumber(entry.usage.tokens.totalTokens)}
                            </span>
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    {entry.usage.note ? (
                      <p className="mt-3 rounded-lg border border-edge/60 bg-white/[0.02] px-2.5 py-2 text-[11px] leading-relaxed text-dim/90">
                        {entry.usage.note}
                      </p>
                    ) : null}

                    <div className="mt-3 flex items-center justify-between border-t border-edge/60 pt-2.5 text-[11px] text-faint">
                      <span>Observed {formatRelative(entry.usage.observedAt)}</span>
                      <span className="font-mono tracking-wide uppercase">{entry.usage.source}</span>
                    </div>
                  </Card>
                );
              })}
              {accounts && accounts.accounts.length === 0 ? (
                <div className="lg:col-span-2">
                  <EmptyState
                    icon={<Gauge className="size-5" />}
                    title="No provider accounts to meter"
                    description="Connect a provider from the Providers page to see official quota reporting."
                  />
                </div>
              ) : null}
            </div>
          </section>

          {summary.notes.length > 0 ? (
            <Card padding="sm" className="border-dashed bg-panel/40">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-md border border-edge bg-panel-2 text-[11px] font-semibold text-dim">
                  i
                </span>
                <ul className="space-y-1 text-[11px] leading-relaxed text-dim">
                  {summary.notes.map((note) => (
                    <li key={note} className="flex gap-2">
                      <span className="mt-1.5 size-1 shrink-0 rounded-full bg-faint" />
                      <span>{note}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Card>
          ) : null}
        </>
      ) : loading ? (
        <UsageSkeleton />
      ) : null}
    </div>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-dim">
      <span className={cn("size-2 rounded-[3px]", swatch)} />
      {label}
    </span>
  );
}

function CardHeading({
  title,
  count,
  hint,
}: {
  title: string;
  count: number;
  hint: string;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-2">
      <div>
        <h2 className="font-display text-sm font-semibold text-ink">{title}</h2>
        <p className="mt-0.5 text-[11px] text-dim">{hint}</p>
      </div>
      <Badge tone="neutral">{count}</Badge>
    </div>
  );
}

function QuietLine({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-edge/80 px-4 py-6 text-center text-sm text-dim">
      {children}
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-semibold tracking-[0.08em] text-faint uppercase">
        {label}
      </div>
      <div className="mt-0.5 truncate font-mono text-xs text-ink">{value}</div>
    </div>
  );
}

function QuotaLine({
  label,
  ok,
  okText,
  badText,
  resetAt,
}: {
  label: string;
  ok: boolean;
  okText: string;
  badText: string;
  resetAt?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-[11px]">
      <span className="text-faint">{label}</span>
      <span className="flex items-center gap-1.5">
        <Badge tone={ok ? "good" : "bad"} dot>
          {ok ? okText : badText}
        </Badge>
        {resetAt ? (
          <span className="text-dim">until {new Date(resetAt).toLocaleString()}</span>
        ) : null}
      </span>
    </div>
  );
}

function DayChart({
  days,
  maxRequests,
}: {
  days: UsageSummary["byDay"];
  maxRequests: number;
}) {
  return (
    <div className="relative">
      {[0.25, 0.5, 0.75, 1].map((ratio) => (
        <div
          key={ratio}
          className="pointer-events-none absolute inset-x-0 border-t border-dashed border-edge/50"
          style={{ bottom: `${ratio * 100}%` }}
          aria-hidden="true"
        />
      ))}
      <div className="relative flex h-48 items-end gap-1.5 sm:gap-2">
        {days.map((day) => {
          const success = Math.max(0, day.requests - day.errors);
          const errorShare = share(day.errors, maxRequests);
          const successShare = share(success, maxRequests);
          return (
            <div
              key={day.day}
              className="group relative flex h-full flex-1 flex-col items-center justify-end gap-1.5"
              title={`${day.day}: ${day.requests} requests, ${day.errors} errors, ${formatTokens(
                day.inputTokens + day.outputTokens,
              )} tokens`}
            >
              <div className="pointer-events-none absolute top-0 left-1/2 z-10 -translate-x-1/2 -translate-y-[calc(100%+6px)] rounded-md border border-edge bg-panel-2 px-2 py-1 font-mono text-[10px] whitespace-nowrap text-ink opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                {formatNumber(day.requests)} req · {formatNumber(day.errors)} err
              </div>
              <div className="flex w-full max-w-[42px] flex-col justify-end">
                {day.errors > 0 ? (
                  <div
                    className="w-full rounded-t-[3px] bg-rose-400/80 transition-colors group-hover:bg-rose-400"
                    style={{ height: `${Math.max(4, errorShare)}px` }}
                  />
                ) : null}
                <div
                  className={cn(
                    "w-full bg-[linear-gradient(180deg,#93a2ff,#6f7ff2)] transition-[filter] group-hover:brightness-110",
                    day.errors > 0 ? "rounded-b-[3px]" : "rounded-t-[3px]",
                  )}
                  style={{ height: `${successShare}%` }}
                />
              </div>
              <span className="max-w-full truncate text-[9px] text-faint group-hover:text-dim">
                {day.day.slice(5)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TrendChip({
  delta,
  unit = "%",
  title,
}: {
  delta: number | null;
  unit?: string;
  title?: string;
}) {
  if (delta === null) return null;
  const flat = delta === 0;
  const up = delta > 0;
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px] leading-none font-medium tabular-nums",
        flat
          ? "border-edge bg-white/[0.03] text-faint"
          : up
            ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300"
            : "border-rose-400/25 bg-rose-400/10 text-rose-300",
      )}
    >
      <Icon className="size-3" />
      {up ? "+" : ""}
      {delta}
      {unit}
    </span>
  );
}

function DonutRow({
  color,
  label,
  value,
  total,
}: {
  color: string;
  label: string;
  value: number;
  total: number;
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-[11px]">
      <span className="flex items-center gap-2 text-dim">
        <span className={cn("size-2 rounded-full", color)} />
        {label}
      </span>
      <span className="font-mono text-ink">
        {formatNumber(value)}
        <span className="ml-1.5 text-faint">
          {total > 0 ? Math.round((value / total) * 100) : 0}%
        </span>
      </span>
    </div>
  );
}

function StatusDonut({ success, failed }: { success: number; failed: number }) {
  const total = success + failed;
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const successLength = total > 0 ? (success / total) * circumference : 0;
  const failedLength = total > 0 ? (failed / total) * circumference : 0;
  const rate = total > 0 ? success / total : null;

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row">
      <div className="relative size-[144px] shrink-0">
        <svg viewBox="0 0 120 120" className="size-full -rotate-90" aria-hidden="true">
          <circle
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.055)"
            strokeWidth="12"
          />
          {success > 0 ? (
            <circle
              cx="60"
              cy="60"
              r={radius}
              fill="none"
              stroke="#34d399"
              strokeWidth="12"
              strokeDasharray={`${Math.max(0, successLength - 2)} ${circumference}`}
            />
          ) : null}
          {failed > 0 ? (
            <circle
              cx="60"
              cy="60"
              r={radius}
              fill="none"
              stroke="#fb7185"
              strokeWidth="12"
              strokeDasharray={`${Math.max(0, failedLength - 2)} ${circumference}`}
              strokeDashoffset={-successLength}
            />
          ) : null}
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <div className="text-center">
            <div className="font-display text-[26px] leading-none font-semibold text-ink">
              {formatNumber(total)}
            </div>
            <div className="mt-1 text-[9px] font-semibold tracking-[0.16em] text-faint uppercase">
              requests
            </div>
          </div>
        </div>
      </div>
      <div className="w-full min-w-0 flex-1 space-y-2">
        <DonutRow color="bg-emerald-400" label="Succeeded" value={success} total={total} />
        <DonutRow color="bg-rose-400" label="Failed" value={failed} total={total} />
        <div className="flex items-center justify-between gap-2 border-t border-edge/60 pt-2 text-[11px]">
          <span className="text-faint">success rate</span>
          <span className="font-mono text-ink">
            {rate === null ? "—" : `${Math.round(rate * 100)}%`}
          </span>
        </div>
      </div>
    </div>
  );
}

function ReliabilityRows({ providers }: { providers: UsageSummary["byProvider"] }) {
  const rows = [...providers].sort((a, b) => b.requests - a.requests);
  return (
    <div className="space-y-3">
      {rows.map((row) => {
        const ok = Math.max(0, row.requests - row.errors);
        const pct = row.requests === 0 ? 100 : Math.round((ok / row.requests) * 100);
        const tone =
          pct >= 99 ? "bg-emerald-400/80" : pct >= 90 ? "bg-amber-400/80" : "bg-rose-400/80";
        return (
          <div key={row.providerKind}>
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className="flex min-w-0 items-center gap-2">
                <ProviderGlyph kind={row.providerKind} size="sm" />
                <span className="truncate text-dim">{row.name}</span>
              </span>
              <span className="shrink-0 font-mono text-ink">
                {pct}%
                <span className="ml-1.5 text-faint">
                  {formatNumber(ok)}/{formatNumber(row.requests)}
                </span>
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
              <div
                className={cn("h-full rounded-full", tone)}
                style={{ width: `${Math.max(2, pct)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function UsageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index} className="space-y-3">
            <div className="flex items-center justify-between">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="size-8 rounded-lg" />
            </div>
            <Skeleton className="h-7 w-24" />
            <Skeleton className="h-3 w-32" />
          </Card>
        ))}
      </div>
      <Card className="space-y-4">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-48 w-full" />
      </Card>
      <div className="grid gap-4 xl:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <Card key={index} className="space-y-4">
            <Skeleton className="h-4 w-28" />
            {Array.from({ length: 4 }).map((__, row) => (
              <Skeleton key={row} className="h-10 w-full" />
            ))}
          </Card>
        ))}
      </div>
    </div>
  );
}
