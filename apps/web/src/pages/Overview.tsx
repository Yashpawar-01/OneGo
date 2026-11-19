import { PlaceholderPage } from "../components/PlaceholderPage.js";

export function Overview() {
  return (
    <PlaceholderPage
      title="Overview"
      phase="Phase 2"
      summary="The control center will summarize connected providers, availability, routing mode, recent conversations, and fallback history — all sourced from real platform state."
      planned={[
        "Connected providers and live connection status",
        "Active provider, current model, and routing mode",
        "Provider availability and quota state (only where officially exposed)",
        "Recent conversations, projects, and fallback events",
      ]}
    />
  );
}
