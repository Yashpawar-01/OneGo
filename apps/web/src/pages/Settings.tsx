import {
  AlertTriangle,
  ExternalLink,
  EyeOff,
  KeyRound,
  Lock,
  LogOut,
  Server,
  Settings2,
  ShieldCheck,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { useSession } from "../context/SessionContext.js";
import { notifyDataChanged } from "../lib/events.js";
import {
  Avatar,
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
  { label: "OpenAI API keys", href: "https://platform.openai.com/api-keys", hint: "platform.openai.com" },
  {
    label: "Anthropic console",
    href: "https://console.anthropic.com/settings/keys",
    hint: "console.anthropic.com",
  },
  {
    label: "GitHub Copilot SDK",
    href: "https://github.com/github/copilot-sdk",
    hint: "github.com",
  },
  { label: "Qoder documentation", href: "https://docs.qoder.com", hint: "docs.qoder.com" },
];

const SECURITY: Array<{ icon: LucideIcon; title: string; detail: string }> = [
  {
    icon: Lock,
    title: "Password hashing",
    detail: "Passwords are hashed with scrypt; sessions use HS256 JWTs with a 7-day expiry.",
  },
  {
    icon: KeyRound,
    title: "Credential encryption",
    detail:
      "Provider credentials are encrypted with AES-256-GCM and key versioning; only a last-4 hint is stored in metadata.",
  },
  {
    icon: ShieldCheck,
    title: "Scoped access",
    detail: "All provider and conversation routes require authentication and are scoped per user.",
  },
  {
    icon: Server,
    title: "Config validation",
    detail: "The server validates environment configuration at boot and redacts secrets in logs.",
  },
  {
    icon: EyeOff,
    title: "Respectful integrations",
    detail: "OneGo never bypasses provider restrictions or reads private session credentials.",
  },
];

export function Settings() {
  const { user, logout } = useSession();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={
          <>
            <Settings2 className="size-3.5" />
            Workspace controls
          </>
        }
        title="Settings"
        description="Account, security posture, and the honest limits of this build."
      />

      <div className="grid gap-4 lg:grid-cols-[1.05fr_1fr]">
        <Card className="relative overflow-hidden">
          <div className="pointer-events-none absolute -top-20 -right-16 size-52 rounded-full bg-brand/[0.09] blur-3xl" />
          <div className="relative flex items-start gap-3">
            <Avatar name={user?.name} email={user?.email} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate font-display text-lg font-semibold text-ink">
                  {user?.name || "Unnamed user"}
                </h2>
                {user ? (
                  <Badge tone={user.role === "owner" ? "info" : "neutral"}>{user.role}</Badge>
                ) : null}
              </div>
              <p className="mt-0.5 truncate text-xs text-dim">{user?.email ?? "—"}</p>
            </div>
            <span className="grid size-8 place-items-center rounded-lg border border-edge bg-white/[0.03] text-dim">
              <UserRound className="size-4" />
            </span>
          </div>

          <dl className="relative mt-5 space-y-2.5 text-sm">
            <AccountRow label="Email" value={user?.email ?? "—"} />
            <AccountRow label="Name" value={user?.name || "—"} />
            <AccountRow
              label="Role"
              value={user ? <Badge tone={user.role === "owner" ? "info" : "neutral"}>{user.role}</Badge> : "—"}
            />
            <AccountRow label="Member since" value={formatDateTime(user?.createdAt)} />
          </dl>

          <div className="relative mt-5 flex items-center justify-between gap-3 border-t border-edge pt-4">
            <p className="text-[11px] leading-relaxed text-faint">
              Signing out clears the local session token on this device.
            </p>
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                logout();
                notifyDataChanged();
              }}
            >
              <LogOut className="size-3.5" />
              Sign out
            </Button>
          </div>
        </Card>

        <Card>
          <div className="mb-4 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="grid size-7 place-items-center rounded-md border border-emerald-400/25 bg-emerald-400/10 text-emerald-300">
                <ShieldCheck className="size-3.5" />
              </span>
              <h2 className="font-display text-sm font-semibold text-ink">Security posture</h2>
            </div>
            <Badge tone="good" dot>
              hardened
            </Badge>
          </div>
          <ul className="space-y-2.5">
            {SECURITY.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.title} className="flex items-start gap-2.5">
                  <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-md border border-edge bg-canvas/50 text-dim">
                    <Icon className="size-3" />
                  </span>
                  <div>
                    <div className="text-xs font-medium text-ink">{item.title}</div>
                    <p className="text-[11px] leading-relaxed text-dim">{item.detail}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      <Card>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-md border border-amber-400/25 bg-amber-400/10 text-amber-300">
              <AlertTriangle className="size-3.5" />
            </span>
            <h2 className="font-display text-sm font-semibold text-ink">Known limitations</h2>
          </div>
          <Badge tone="warn">declared, not hidden</Badge>
        </div>
        <ol className="grid gap-2 md:grid-cols-2">
          {LIMITATIONS.map((item, index) => (
            <li
              key={item}
              className="flex items-start gap-3 rounded-xl border border-edge/70 bg-canvas/30 px-3 py-2.5"
            >
              <span className="grid size-5 shrink-0 place-items-center rounded-md border border-edge bg-panel font-mono text-[10px] text-dim">
                {index + 1}
              </span>
              <span className="text-[11px] leading-relaxed text-dim">{item}</span>
            </li>
          ))}
        </ol>
      </Card>

      <Card>
        <div className="mb-4">
          <h2 className="font-display text-sm font-semibold text-ink">
            Where credentials come from
          </h2>
          <p className="mt-0.5 text-[11px] text-dim">
            Official consoles only — you create the key, OneGo stores it encrypted.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {DOC_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              target="_blank"
              rel="noreferrer"
              className="group flex items-center justify-between gap-3 rounded-xl border border-edge/80 bg-canvas/30 px-3 py-2.5 text-xs transition-colors hover:border-edge-strong hover:bg-white/[0.03]"
            >
              <span className="min-w-0">
                <span className="block truncate text-ink">{link.label}</span>
                <span className="block truncate font-mono text-[10px] text-faint">
                  {link.hint}
                </span>
              </span>
              <ExternalLink className="size-3.5 shrink-0 text-faint transition-colors group-hover:text-brand" />
            </a>
          ))}
        </div>
        <p className="mt-4 border-t border-edge pt-3 text-[11px] leading-relaxed text-dim/90">
          OneGo uses official integration channels only. It does not scrape web sessions or reuse
          other tools&apos; private tokens.
        </p>
      </Card>
    </div>
  );
}

function AccountRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-xs text-dim">{label}</dt>
      <dd className="min-w-0 truncate text-right text-xs text-ink">{value}</dd>
    </div>
  );
}
