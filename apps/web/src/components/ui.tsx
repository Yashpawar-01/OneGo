import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { Link } from "react-router-dom";

export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-edge bg-panel/70 p-5", className)}>
      {children}
    </div>
  );
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-brand text-[#0a0c10] hover:bg-brand/90 disabled:bg-brand/40 disabled:text-[#0a0c10]/60",
  secondary:
    "border border-edge bg-white/[0.03] text-ink hover:bg-white/[0.07] disabled:text-dim/60",
  ghost: "text-dim hover:bg-white/5 hover:text-ink",
  danger:
    "border border-rose-500/40 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20",
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "px-2.5 py-1.5 text-xs",
  md: "px-3.5 py-2 text-sm",
};

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:cursor-not-allowed",
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
    >
      {props.children}
    </button>
  );
}

export function LinkButton({
  to,
  children,
  className,
}: {
  to: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      to={to}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-md border border-edge bg-white/[0.03] px-3.5 py-2 text-sm font-medium text-ink transition-colors hover:bg-white/[0.07]",
        className,
      )}
    >
      {children}
    </Link>
  );
}

type BadgeTone = "neutral" | "good" | "warn" | "bad" | "info";

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: "border-edge bg-white/[0.03] text-dim",
  good: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  warn: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  bad: "border-rose-500/30 bg-rose-500/10 text-rose-300",
  info: "border-brand/30 bg-brand/10 text-brand",
};

export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const tone: BadgeTone =
    normalized === "connected"
      ? "good"
      : normalized === "error" || normalized === "expired"
        ? "bad"
        : normalized === "disabled"
          ? "neutral"
          : "warn";
  return <Badge tone={tone}>{normalized}</Badge>;
}

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block space-y-1.5", className)}>
      <span className="block text-xs font-medium uppercase tracking-wide text-dim">
        {label}
      </span>
      {children}
      {hint ? <span className="block text-xs text-dim">{hint}</span> : null}
    </label>
  );
}

const INPUT_CLASSES =
  "w-full rounded-md border border-edge bg-canvas/60 px-3 py-2 text-sm text-ink placeholder:text-dim/60 focus:border-brand/60 focus:outline-none focus:ring-1 focus:ring-brand/40";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(INPUT_CLASSES, props.className)} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn(INPUT_CLASSES, props.className)} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea {...props} className={cn(INPUT_CLASSES, "min-h-20", props.className)} />
  );
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-dim">
      <span className="size-4 animate-spin rounded-full border-2 border-edge border-t-brand" />
      {label}
    </div>
  );
}

export function ErrorBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
      <span>{message}</span>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 text-xs font-medium underline underline-offset-2 hover:text-white"
        >
          Retry
        </button>
      ) : null}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-edge px-6 py-10 text-center">
      <div className="text-sm font-medium text-ink">{title}</div>
      <p className="max-w-md text-sm text-dim">{description}</p>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
        {description ? (
          <p className="mt-1 max-w-3xl text-sm text-dim">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <Card className="min-w-0">
      <div className="text-xs font-medium uppercase tracking-wide text-dim">{label}</div>
      <div className="mt-2 truncate text-2xl font-semibold text-ink">{value}</div>
      {hint ? <div className="mt-1 text-xs text-dim">{hint}</div> : null}
    </Card>
  );
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en-US").format(value);
}

export function formatCost(value: number | null | undefined): string {
  if (value === null || value === undefined) return "Not reported";
  return `$${value.toFixed(value < 0.01 ? 6 : 4)}`;
}

export function formatTokens(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

export function formatRelative(value: string | null | undefined): string {
  if (!value) return "—";
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return "—";
  const diff = Date.now() - then;
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(value).toLocaleDateString();
}
