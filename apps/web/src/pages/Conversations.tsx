import { PlaceholderPage } from "../components/PlaceholderPage.js";

export function Conversations() {
  return (
    <PlaceholderPage
      title="Conversations"
      phase="Phases 5 & 7"
      summary="Conversations belong to the platform, not to a provider. Each keeps one stable ID and an append-only event history so any provider can resume the task after a switch."
      planned={[
        "Conversation list with provider/model attribution per message",
        "Cross-provider context transfer and resume",
        "Context snapshots, tool history, and pending task state",
        "Fallback event timeline",
      ]}
    />
  );
}
