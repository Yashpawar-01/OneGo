import { PlaceholderPage } from "../components/PlaceholderPage.js";

export function Providers() {
  return (
    <PlaceholderPage
      title="Providers"
      phase="Phases 3 & 4"
      summary="Connect OpenAI, Anthropic, GitHub, and Qoder using only their official integration paths. Each adapter exposes exactly the capabilities the provider actually supports."
      planned={[
        "Add and remove provider accounts with encrypted credential storage",
        "Connection tests, status, supported models, and capability matrix",
        "Provider priority ordering used by the automatic fallback engine",
        "Explicit 'usage information unavailable' states where providers expose no API",
      ]}
    />
  );
}
