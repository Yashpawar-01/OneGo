import { PlaceholderPage } from "../components/PlaceholderPage.js";

export function UsageAnalytics() {
  return (
    <PlaceholderPage
      title="Usage Analytics"
      phase="Phase 10"
      summary="Unified usage view that separates subscription quotas, API usage, estimated token cost, and rate limits. Values are shown only when the provider reports them through an official channel."
      planned={[
        "Per-provider request counts, token usage, and rate-limit state",
        "Historical usage charts and provider comparison",
        "Estimated API cost where pricing data is available",
        "Reset times and quota status only when officially reported",
      ]}
    />
  );
}
