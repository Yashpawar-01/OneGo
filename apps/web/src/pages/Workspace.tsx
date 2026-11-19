import { PlaceholderPage } from "../components/PlaceholderPage.js";

export function Workspace() {
  return (
    <PlaceholderPage
      title="AI Workspace"
      phase="Phases 5 & 9"
      summary="A single chat surface across every provider: streaming responses, tool activity, file context, and continuity when the underlying provider changes mid-task."
      planned={[
        "Streaming chat with provider/model indicators and manual switching",
        "Project file explorer and Monaco editor",
        "Tool activity timeline with approvals for destructive actions",
        "Context and task-status panel backed by conversation snapshots",
      ]}
    />
  );
}
