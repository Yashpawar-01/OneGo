import { PlaceholderPage } from "../components/PlaceholderPage.js";

export function ModelRouter() {
  return (
    <PlaceholderPage
      title="Model Router"
      phase="Phase 10"
      summary="Manual, automatic, and intelligent routing modes with user-defined priorities. Intelligent mode scores task type against model capability, context window, latency, cost, and known quota availability."
      planned={[
        "Manual mode: explicit provider and model selection",
        "Automatic mode: next available provider by priority",
        "Intelligent mode: task classification with explainable decisions",
        "Routing rules and per-task model preferences",
      ]}
    />
  );
}
