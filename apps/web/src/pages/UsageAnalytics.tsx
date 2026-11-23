import { useCallback, useEffect, useState } from "react";
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
  Stat,
  StatusBadge,
  formatCost,
  formatDateTime,
  formatNumber,
  formatTokens,
} from "../components/ui.js";

const RANGES = [1, 7, 14, 30, 90];

function pct(value: number, max: number): string {
  if (max <= 0) return "0%";
  return `${Math.max(2, Math.round((value / max) * 100))}%`;
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Usage Analytics"
        description="Every number below comes from UsageEvents recorded by OneGo when a provider actually answered. Missing data is shown as not reported — never estimated silently."
        actions={
          <div className="flex items-center gap-2">
            <div className="flex rounded-md border border-edge p-0.5">
              {RANGES.map((range) => (
                <button
                  key={range}
                  type="button"
                  onClick={() => setDays(range)}
                  className={[
                    "rounded px-2 py-1 text-xs",
                    days === range ? "bg-brand/15 text-brand" : "text-dim hover:text-ink",
                  ].join(" ")}
                >
                  {range}d
                </button>
              ))}
            </div>
            <Button variant="secondary" onClick={load}>
              Refresh
            </Button>
          </div>
        }
      />

      {error ? <ErrorBanner message={error} onRetry={load} /> : null}

      {summary ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat
              label="Requests"
              value={formatNumber(summary.totals.requests)}
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
              hint={`${days}-day window`}
            />
            <Stat
              label="Input tokens"
              value={formatTokens(summary.totals.inputTokens)}
              hint="Only where providers report usage"
            />
            <Stat
              label="Estimated cost"
              value={formatCost(summary.totals.estimatedCostUsd)}
              hint="List-price estimate, nulls when unpriced"
            />
          </section>

          <Card>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-ink">Requests by day</h2>
              <div className="flex flex-wrap items-center gap-1.5">
                {Object.entries(summary.totals.sources).map(([source, count]) => (
                  <Badge key={source} tone="neutral">
                    {source}: {formatNumber(count)}
                  </Badge>
                ))}
              </div>
            </div>
            {summary.byDay.length === 0 ? (
              <EmptyState
                title="No usage recorded in this window"
                description="Send a message in the workspace. Usage rows appear only after a provider responds."
              />
            ) : (
              <div className="flex h-40 items-end gap-1">
                {summary.byDay.map((day) => (
                  <div
                    key={day.day}
                    className="group relative flex flex-1 flex-col items-center justify-end gap-1"
                    title={`${day.day}: ${day.requests} requests, ${day.errors} errors, ${formatTokens(
                      day.inputTokens + day.outputTokens,
                    )} tokens`}
                  >
                    <div className="flex w-full flex-col justify-end" style={{ height: "100%" }}>
                      <div
                        className="w-full rounded-t bg-brand/60 transition-colors group-hover:bg-brand"
                        style={{ height: pct(day.requests, maxDayRequests) }}
                      />
                    </div>
                    <span className="max-w-full truncate text-[9px] text-dim">
                      {day.day.slice(5)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <h2 className="mb-3 text-sm font-semibold text-ink">By provider</h2>
              {summary.byProvider.length === 0 ? (
                <p className="text-sm text-dim">No provider activity in this window.</p>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="text-dim">
                    <tr>
                      <th className="pb-2 font-medium">Provider</th>
                      <th className="pb-2 text-right font-medium">Requests</th>
                      <th className="pb-2 text-right font-medium">Tokens</th>
                      <th className="pb-2 text-right font-medium">Cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-edge/70">
                    {summary.byProvider.map((row) => (
                      <tr key={row.providerKind}>
                        <td className="py-2 text-ink">
                          {row.name}
                          {row.errors > 0 ? (
                            <span className="ml-1.5 text-rose-300">({row.errors} err)</span>
                          ) : null}
                        </td>
                        <td className="py-2 text-right text-ink">{formatNumber(row.requests)}</td>
                        <td className="py-2 text-right text-dim">
                          {formatTokens(row.inputTokens + row.outputTokens)}
                        </td>
                        <td className="py-2 text-right text-dim">{formatCost(row.costUsd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>

            <Card>
              <h2 className="mb-3 text-sm font-semibold text-ink">By model</h2>
              {summary.byModel.length === 0 ? (
                <p className="text-sm text-dim">No model activity in this window.</p>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="text-dim">
                    <tr>
                      <th className="pb-2 font-medium">Model</th>
                      <th className="pb-2 text-right font-medium">Requests</th>
                      <th className="pb-2 text-right font-medium">Tokens</th>
                      <th className="pb-2 text-right font-medium">Cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-edge/70">
                    {summary.byModel.map((row) => (
                      <tr key={row.modelId}>
                        <td className="py-2 text-ink">{row.modelId}</td>
                        <td className="py-2 text-right text-ink">{formatNumber(row.requests)}</td>
                        <td className="py-2 text-right text-dim">
                          {formatTokens(row.inputTokens + row.outputTokens)}
                        </td>
                        <td className="py-2 text-right text-dim">{formatCost(row.costUsd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </div>

          <Card>
            <h2 className="mb-3 text-sm font-semibold text-ink">
              Usage notes &amp; provider-reported quotas
            </h2>
            <p className="mb-3 text-xs text-dim">
              Quotas below are fetched from each provider&apos;s official channel when available.
              Copilot and Qoder do not expose token meters, so their token usage is intentionally blank.
            </p>
            <div className="grid gap-3 lg:grid-cols-2">
              {(accounts?.accounts ?? []).map((entry) => (
                <div key={entry.account.id} className="rounded-lg border border-edge bg-canvas/40 p-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm text-ink">{entry.account.label}</span>
                    <Badge tone="neutral">{entry.account.providerName}</Badge>
                    <StatusBadge status={entry.account.enabled ? entry.account.status : "disabled"} />
                    <Badge
                      tone={
                        entry.usage.quota?.exhausted
                          ? "bad"
                          : entry.usage.rateLimit?.limited
                            ? "warn"
                            : "good"
                      }
                    >
                      {entry.usage.reporting.replaceAll("_", " ")}
                    </Badge>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-dim">
                    <div>
                      <span className="block text-dim/70">Last 7 days</span>
                      {formatNumber(entry.last7Days.requests)} requests ·{" "}
                      {formatTokens(entry.last7Days.inputTokens + entry.last7Days.outputTokens)}{" "}
                      tokens
                    </div>
                    <div>
                      <span className="block text-dim/70">Cost (7d)</span>
                      {formatCost(entry.last7Days.estimatedCostUsd)}
                    </div>
                  </div>
                  {entry.usage.quota || entry.usage.rateLimit || entry.usage.tokens ? (
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-dim">
                      {entry.usage.quota ? (
                        <span>
                          quota:{" "}
                          {entry.usage.quota.exhausted
                            ? `exhausted${
                                entry.usage.quota.resetAt
                                  ? ` until ${formatDateTime(entry.usage.quota.resetAt)}`
                                  : ""
                              }`
                            : "available"}
                        </span>
                      ) : null}
                      {entry.usage.rateLimit ? (
                        <span>
                          rate limit:{" "}
                          {entry.usage.rateLimit.limited
                            ? `limited${
                                entry.usage.rateLimit.resetAt
                                  ? ` until ${formatDateTime(entry.usage.rateLimit.resetAt)}`
                                  : ""
                              }`
                            : "clear"}
                        </span>
                      ) : null}
                      {entry.usage.tokens?.totalTokens !== undefined ? (
                        <span>tokens: {formatNumber(entry.usage.tokens.totalTokens)}</span>
                      ) : null}
                    </div>
                  ) : null}
                  {entry.usage.note ? (
                    <p className="mt-1 text-[11px] text-dim/80">{entry.usage.note}</p>
                  ) : null}
                </div>
              ))}
              {accounts?.accounts.length === 0 ? (
                <p className="text-sm text-dim">Connect a provider to see quota reporting.</p>
              ) : null}
            </div>
            <ul className="mt-4 list-disc space-y-1 pl-4 text-[11px] text-dim">
              {summary.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </Card>
        </>
      ) : loading ? (
        <p className="py-10 text-sm text-dim">Loading usage…</p>
      ) : null}
    </div>
  );
}
