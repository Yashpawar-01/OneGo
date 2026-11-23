import { useState, type FormEvent } from "react";
import { useSession } from "../context/SessionContext.js";
import { Button, Field, Input } from "./ui.js";

export function AuthScreen() {
  const { login, register } = useSession();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
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
    <div className="flex min-h-screen bg-canvas text-ink">
      <div className="hidden flex-1 flex-col justify-between border-r border-edge bg-panel/40 p-12 lg:flex">
        <div>
          <div className="text-2xl font-semibold tracking-tight">OneGo</div>
          <p className="mt-2 max-w-md text-sm text-dim">
            One workspace for every AI coding provider. Bring your own accounts,
            stream responses, and keep working when a quota runs out.
          </p>
        </div>
        <div className="space-y-4">
          {[
            [
              "Automatic fallback",
              "A quota or rate limit switches to the next connected provider with full context preserved.",
            ],
            [
              "Unified conversations",
              "Continue the same thread across OpenAI, Claude, Copilot, and Qoder.",
            ],
            [
              "Official channels only",
              "API keys, the GitHub Copilot SDK, and the Qoder CLI. No scraping or bypassing limits.",
            ],
          ].map(([title, copy]) => (
            <div key={title} className="rounded-lg border border-edge bg-canvas/40 p-4">
              <div className="text-sm font-medium">{title}</div>
              <p className="mt-1 text-xs leading-relaxed text-dim">{copy}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-dim">Credentials are encrypted at rest and never returned to the browser.</p>
      </div>

      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-6 lg:hidden">
            <div className="text-xl font-semibold tracking-tight">OneGo</div>
            <p className="text-xs text-dim">Unified AI coding hub</p>
          </div>
          <div className="mb-5 flex rounded-lg border border-edge bg-panel p-1">
            {(["login", "register"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => {
                  setMode(option);
                  setError(null);
                }}
                className={[
                  "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  mode === option ? "bg-brand/15 text-brand" : "text-dim hover:text-ink",
                ].join(" ")}
              >
                {option === "login" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
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
              <Input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
              />
            </Field>
            <Field
              label="Password"
              hint={mode === "register" ? "At least 8 characters." : undefined}
            >
              <Input
                type="password"
                required
                minLength={mode === "register" ? 8 : 1}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                autoComplete={mode === "register" ? "new-password" : "current-password"}
              />
            </Field>

            {error ? (
              <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                {error}
              </div>
            ) : null}

            <Button type="submit" variant="primary" className="w-full" disabled={submitting}>
              {submitting
                ? "Please wait…"
                : mode === "login"
                  ? "Sign in"
                  : "Create account"}
            </Button>
          </form>

          <p className="mt-4 text-center text-xs text-dim">
            {mode === "login"
              ? "The first registered user becomes the workspace owner."
              : "Your credentials are stored only as encrypted ciphertext."}
          </p>
        </div>
      </div>
    </div>
  );
}
