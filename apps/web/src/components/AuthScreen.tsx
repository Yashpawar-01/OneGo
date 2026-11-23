import { useState, type FormEvent } from "react";
import {
  ArrowRight,
  Eye,
  EyeOff,
  Layers,
  Mail,
  ShieldCheck,
  Sparkles,
  Waypoints,
  Zap,
} from "lucide-react";
import { useSession } from "../context/SessionContext.js";
import {
  Badge,
  Button,
  Field,
  Input,
  ProviderGlyph,
  SegmentedControl,
} from "./ui.js";

const FEATURES = [
  {
    icon: Zap,
    title: "Automatic fallback",
    body: "A quota or rate limit switches to the next connected provider with full context preserved.",
  },
  {
    icon: Waypoints,
    title: "Unified conversations",
    body: "Continue the same thread across OpenAI, Claude, Copilot, and Qoder.",
  },
  {
    icon: ShieldCheck,
    title: "Official channels only",
    body: "API keys, the GitHub Copilot SDK, and the Qoder CLI. No scraping, no bypassing limits.",
  },
];

export function AuthScreen() {
  const { login, register } = useSession();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === "login") await login(email, password);
      else await register(email, password, name || undefined);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Authentication failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-screen overflow-hidden bg-canvas text-ink">
      <div className="pointer-events-none absolute inset-0 bg-aurora" />
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-70" />
      <div className="pointer-events-none absolute -top-40 -left-24 size-[34rem] animate-float rounded-full bg-brand/15 blur-[120px]" />
      <div className="pointer-events-none absolute -right-24 bottom-[-10rem] size-[30rem] animate-float-slow rounded-full bg-[#b18cff]/10 blur-[130px]" />

      <div className="relative hidden flex-1 flex-col justify-between border-r border-edge/70 px-12 py-10 lg:flex xl:px-16">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-xl border border-white/10 bg-[linear-gradient(135deg,#93a2ff,#6f7ff2_55%,#4cc9f0)] font-display text-base font-bold text-[#080b12] shadow-glow">
            O
          </span>
          <div>
            <div className="font-display text-lg leading-none font-semibold tracking-tight">
              OneGo
            </div>
            <p className="mt-1 text-[11px] tracking-[0.14em] text-faint uppercase">
              Unified AI coding hub
            </p>
          </div>
          <Badge tone="info" className="ml-2">
            <Sparkles className="size-3" /> multi-provider
          </Badge>
        </div>

        <div className="max-w-xl py-10">
          <h1 className="font-display text-[clamp(2.6rem,4.4vw,3.6rem)] leading-[1.04] font-semibold tracking-[-0.03em]">
            <span className="text-gradient">Every model.</span>
            <br />
            <span className="text-gradient-brand">One workspace.</span>
          </h1>
          <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-dim">
            Bring your own OpenAI, Anthropic, GitHub Copilot, and Qoder accounts.
            OneGo streams every reply, keeps one conversation, and reroutes
            instantly when a provider runs dry.
          </p>

          <div className="mt-8 space-y-2.5">
            {FEATURES.map((feature) => (
              <div
                key={feature.title}
                className="glass flex items-start gap-3.5 rounded-xl border border-edge/80 px-4 py-3.5 transition-colors hover:border-edge-strong"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-brand/25 bg-brand/10 text-[#b9c3ff]">
                  <feature.icon className="size-4" />
                </span>
                <div>
                  <div className="text-sm font-medium text-ink">{feature.title}</div>
                  <p className="mt-0.5 text-xs leading-relaxed text-dim">{feature.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            {(["openai", "anthropic", "github-copilot", "qoder"] as const).map((kind) => (
              <ProviderGlyph key={kind} kind={kind} size="sm" />
            ))}
            <span className="ml-1 text-[11px] text-faint">4 official integration channels</span>
          </div>
          <p className="text-[11px] text-faint">
            Credentials encrypted · AES-256-GCM at rest
          </p>
        </div>
      </div>

      <div className="relative flex w-full items-center justify-center px-5 py-10 lg:w-[34rem] lg:shrink-0 xl:w-[38rem]">
        <div className="w-full max-w-[24rem]">
          <div className="mb-7 flex items-center gap-3 lg:hidden">
            <span className="grid size-9 place-items-center rounded-xl border border-white/10 bg-[linear-gradient(135deg,#93a2ff,#6f7ff2_55%,#4cc9f0)] font-display text-base font-bold text-[#080b12]">
              O
            </span>
            <div>
              <div className="font-display text-lg leading-none font-semibold">OneGo</div>
              <p className="mt-1 text-[11px] text-faint">Unified AI coding hub</p>
            </div>
          </div>

          <div className="glass-strong animate-fade-up rounded-2xl border border-edge-strong p-6 shadow-[0_40px_120px_-40px_rgba(0,0,0,0.9)]">
            <div className="mb-5">
              <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.16em] text-brand uppercase">
                <Layers className="size-3.5" />
                {mode === "login" ? "Welcome back" : "Get started"}
              </div>
              <h2 className="mt-2 font-display text-xl font-semibold tracking-tight">
                {mode === "login" ? "Sign in to your workspace" : "Create your workspace"}
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-dim">
                {mode === "login"
                  ? "Your accounts, conversations, and provider keys stay encrypted."
                  : "The first registered user becomes the workspace owner."}
              </p>
            </div>

            <SegmentedControl
              ariaLabel="Authentication mode"
              value={mode}
              onChange={(next) => {
                setMode(next);
                setError(null);
              }}
              options={[
                { value: "login", label: "Sign in" },
                { value: "register", label: "Create account" },
              ]}
              className="mb-5 w-full [&>button]:flex-1"
            />

            <form onSubmit={onSubmit} className="space-y-3.5">
              {mode === "register" ? (
                <Field label="Name">
                  <Input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Ada Lovelace"
                    autoComplete="name"
                  />
                </Field>
              ) : null}

              <Field label="Email">
                <div className="relative">
                  <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
                  <Input
                    type="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    className="pl-9"
                  />
                </div>
              </Field>

              <Field
                label="Password"
                hint={mode === "register" ? "At least 8 characters." : undefined}
              >
                <div className="relative">
                  <ShieldCheck className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
                  <Input
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={mode === "register" ? 8 : 1}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="••••••••"
                    autoComplete={mode === "register" ? "new-password" : "current-password"}
                    className="pr-10 pl-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute top-1/2 right-2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-faint transition-colors hover:text-ink"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </Field>

              {error ? (
                <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                  {error}
                </div>
              ) : null}

              <Button
                type="submit"
                variant="primary"
                className="mt-1 w-full"
                disabled={submitting}
              >
                {submitting ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
                <ArrowRight className="size-4" />
              </Button>
            </form>

            <p className="mt-4 text-center text-[11px] leading-relaxed text-faint">
              {mode === "login"
                ? "Sessions are signed JWTs. Provider secrets are never returned to the browser."
                : "Credentials are stored only as encrypted ciphertext with key versioning."}
            </p>
          </div>

          <p className="mt-5 text-center text-[11px] text-faint">
            OneGo uses official provider APIs, SDKs, and CLIs only.
          </p>
        </div>
      </div>
    </div>
  );
}
