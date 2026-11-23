import { useSession } from "../context/SessionContext.js";
import { notifyDataChanged } from "../lib/events.js";
import {
  Badge,
  Button,
  Card,
  PageHeader,
  formatDateTime,
} from "../components/ui.js";

const LIMITATIONS = [
  "Provider credentials are encrypted with AES-256-GCM at rest and are never returned to the browser after creation.",
  "Usage and cost figures are recorded only from official provider responses; missing values show as “not reported” instead of estimates.",
  "GitHub Copilot runs through the official @github/copilot-sdk; Qoder runs through the Qoder CLI. Token meters are not exposed by either, so their token usage stays blank.",
  "Repository indexing, tool execution, and Monaco editing are planned but not part of this build.",
];

const DOC_LINKS = [
  { label: "OpenAI API keys", href: "https://platform.openai.com/api-keys" },
  { label: "Anthropic console", href: "https://console.anthropic.com/settings/keys" },
  { label: "GitHub Copilot SDK", href: "https://github.com/github/copilot-sdk" },
  { label: "Qoder documentation", href: "https://docs.qoder.com" },
];

export function Settings() {
  const { user, logout } = useSession();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Account, security posture, and the honest limits of this build."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-ink">Account</h2>
          {user ? (
            <dl className="space-y-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-dim">Email</dt>
                <dd className="truncate text-ink">{user.email}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-dim">Name</dt>
                <dd className="text-ink">{user.name || "—"}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-dim">Role</dt>
                <dd>
                  <Badge tone={user.role === "owner" ? "info" : "neutral"}>{user.role}</Badge>
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-dim">Member since</dt>
                <dd className="text-ink">{formatDateTime(user.createdAt)}</dd>
              </div>
            </dl>
          ) : null}
          <div className="mt-4 flex items-center gap-2">
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                logout();
                notifyDataChanged();
              }}
            >
              Sign out
            </Button>
          </div>
        </Card>

        <Card>
          <h2 className="mb-3 text-sm font-semibold text-ink">Security</h2>
          <ul className="list-disc space-y-1.5 pl-4 text-xs text-dim">
            <li>Passwords are hashed with scrypt; sessions use HS256 JWTs with a 7-day expiry.</li>
            <li>Provider credentials are encrypted with AES-256-GCM and key versioning; only a last-4 hint is stored in metadata.</li>
            <li>All provider and conversation routes require authentication and are scoped per user.</li>
            <li>The server validates environment configuration at boot and redacts secrets in logs.</li>
            <li>OneGo never bypasses provider restrictions or reads private session credentials.</li>
          </ul>
        </Card>
      </div>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-ink">Known limitations</h2>
        <ul className="list-disc space-y-1.5 pl-4 text-xs text-dim">
          {LIMITATIONS.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-ink">Where credentials come from</h2>
        <div className="flex flex-wrap gap-2">
          {DOC_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              target="_blank"
              rel="noreferrer"
              className="rounded-md border border-edge px-3 py-1.5 text-xs text-dim hover:bg-white/5 hover:text-ink"
            >
              {link.label} ↗
            </a>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-dim/80">
          OneGo uses official integration channels only. It does not scrape web sessions or reuse
          other tools&apos; private tokens.
        </p>
      </Card>
    </div>
  );
}
