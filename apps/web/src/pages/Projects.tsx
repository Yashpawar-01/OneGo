import { PlaceholderPage } from "../components/PlaceholderPage.js";

export function Projects() {
  return (
    <PlaceholderPage
      title="Projects"
      phase="Phase 8"
      summary="Projects bind conversations, repositories, and persistent memory. Repository indexing and semantic retrieval keep context packages small and relevant instead of shipping the whole repo to every request."
      planned={[
        "Local folders and Git repository registration",
        "File indexing and semantic code search",
        "Inspectable, editable project memory",
        "Git diffs and change history per project",
      ]}
    />
  );
}
