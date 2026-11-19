import { PlaceholderPage } from "../components/PlaceholderPage.js";

export function Settings() {
  return (
    <PlaceholderPage
      title="Settings"
      phase="Phase 11"
      summary="Account, security, and workspace configuration. Credentials stay server-side, encrypted at rest, and are never exposed to the browser or written to logs."
      planned={[
        "Account and role-based access control",
        "Credential rotation and audit log review",
        "Approval policy for destructive operations",
        "Workspace and provider defaults",
      ]}
    />
  );
}
