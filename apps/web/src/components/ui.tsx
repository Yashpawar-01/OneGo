import {
  useEffect,
  useId,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import {
  Asterisk,
  CircleDot,
  GitBranch,
  Sparkles,
  SquareTerminal,
  X,
  type LucideIcon,
} from "lucide-react";

export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

type CardPadding = "none" | "sm" | "md" | "lg";

const CARD_PADDING: Record<CardPadding, string> = {
  none: "",
  sm: "p-3",
  md: "p-5",
  lg: "p-6",
};

export function Card({
  children,
  className,
  padding = "md",
  glow = false,
}: {
  children: ReactNode;
  className?: string;
  padding?: CardPadding;
  glow?: boolean;
}) {
  return (
    <div
      className={cn(
        "card-sheen hairline relative rounded-2xl border border-edge bg-panel/70 shadow-panel",
        glow && "shadow-glow",
        CARD_PADDING[padding],
        className,
      )}
    >
      {children}
    </div>
  );
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "xs" | "sm" | "md";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-[linear-gradient(135deg,#93a2ff_0%,#6f7ff2_58%,#5f6ee6_100%)] text-[#080b12] shadow-[0_14px_34px_-16px_rgba(124,140,255,0.9)] hover:brightness-[1.08] active:brightness-95",
  secondary:
    "border border-edge bg-white/[0.035] text-ink hover:border-edge-strong hover:bg-white/[0.07]",
  ghost: "text-dim hover:bg-white/[0.055] hover:text-ink",
  danger:
    "border border-rose-500/35 bg-rose-500/10 text-rose-200 hover:border-rose-500/60 hover:bg-rose-500/20",
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  xs: "h-7 px-2.5 text-[11px]",
  sm: "h-8 px-3 text-xs",
  md: "h-9.5 px-4 text-sm",
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
        "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg font-medium whitespace-nowrap transition-all duration-150 disabled:pointer-events-none disabled:opacity-45",
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
  variant = "secondary",
  size = "md",
}: {
  to: string;
  children: ReactNode;
  className?: string;
  variant?: "primary" | "secondary" | "ghost";
  size?: ButtonSize;
}) {
  return (
    <Link
      to={to}
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg font-medium transition-all duration-150",
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
    >
      {children}
    </Link>
  );
}

type BadgeTone = "neutral" | "good" | "warn" | "bad" | "info" | "violet";

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: "border-edge bg-white/[0.035] text-dim",
  good: "border-emerald-400/25 bg-emerald-400/10 text-emerald-300",
  warn: "border-amber-400/25 bg-amber-400/10 text-amber-300",
  bad: "border-rose-400/25 bg-rose-400/10 text-rose-300",
  info: "border-brand/30 bg-brand/10 text-[#b9c3ff]",
  violet: "border-[#b18cff]/25 bg-[#b18cff]/10 text-[#d8c6ff]",
};

const DOT_TONES: Record<BadgeTone, string> = {
  neutral: "bg-dim",
  good: "bg-emerald-400",
  warn: "bg-amber-400",
  bad: "bg-rose-400",
  info: "bg-brand",
  violet: "bg-[#b18cff]",
};

export function Badge({
  tone = "neutral",
  children,
  className,
  dot = false,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
        BADGE_TONES[tone],
        className,
      )}
    >
      {dot ? (
        <span
          className={cn(
            "size-1.5 rounded-full",
            DOT_TONES[tone],
            tone === "good" && "animate-pulse-soft",
          )}
        />
      ) : null}
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
  return (
    <Badge tone={tone} dot>
      {normalized}
    </Badge>
  );
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
      <span className="block text-[11px] font-semibold tracking-[0.08em] text-dim uppercase">
        {label}
      </span>
      {children}
      {hint ? <span className="block text-[11px] leading-relaxed text-faint">{hint}</span> : null}
    </label>
  );
}

const INPUT_CLASSES =
  "w-full rounded-lg border border-edge bg-canvas/70 px-3 py-2 text-sm text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition-colors placeholder:text-faint focus:border-brand/55 focus:bg-canvas focus:outline-none focus:ring-2 focus:ring-brand/20 disabled:cursor-not-allowed disabled:opacity-55";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(INPUT_CLASSES, props.className)} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(INPUT_CLASSES, "cursor-pointer pr-8", props.className)}
    />
  );
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(INPUT_CLASSES, "min-h-20 resize-y leading-relaxed", props.className)}
    />
  );
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2.5 text-sm text-dim">
      <span className="size-4 animate-spin rounded-full border-2 border-edge border-t-brand" />
      {label}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("shimmer rounded-lg bg-white/[0.025]", className)} />;
}

export function SkeletonCard({ rows = 3 }: { rows?: number }) {
  return (
    <Card className="space-y-3">
      <Skeleton className="h-4 w-32" />
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className="h-9 w-full" />
      ))}
    </Card>
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
    <div className="flex items-start justify-between gap-3 rounded-xl border border-rose-500/30 bg-rose-500/[0.08] px-4 py-3 text-sm text-rose-200">
      <span className="leading-relaxed">{message}</span>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 rounded-md px-1 text-xs font-semibold underline underline-offset-2 hover:text-white"
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
  icon,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="relative flex flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border border-dashed border-edge-strong/70 px-6 py-12 text-center">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_60%_at_50%_0%,rgba(124,140,255,0.08),transparent_70%)]" />
      {icon ? (
        <div className="relative mb-1 grid size-11 place-items-center rounded-xl border border-edge bg-panel-2 text-brand">
          {icon}
        </div>
      ) : null}
      <div className="relative text-sm font-semibold text-ink">{title}</div>
      <p className="relative max-w-md text-sm leading-relaxed text-dim">{description}</p>
      {action ? <div className="relative mt-3">{action}</div> : null}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? (
          <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold tracking-[0.16em] text-brand uppercase">
            {eyebrow}
          </div>
        ) : null}
        <h1 className="font-display text-[26px] leading-tight font-semibold tracking-[-0.02em] text-ink">
          {title}
        </h1>
        {description ? (
          <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-dim">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

type StatAccent = "brand" | "violet" | "cyan" | "emerald" | "amber" | "rose";

const STAT_ACCENTS: Record<StatAccent, { tile: string; glow: string }> = {
  brand: {
    tile: "border-brand/25 bg-brand/10 text-[#b9c3ff]",
    glow: "from-brand/[0.14]",
  },
  violet: {
    tile: "border-[#b18cff]/25 bg-[#b18cff]/10 text-[#d8c6ff]",
    glow: "from-[#b18cff]/[0.14]",
  },
  cyan: {
    tile: "border-cyan-400/25 bg-cyan-400/10 text-cyan-300",
    glow: "from-cyan-400/[0.12]",
  },
  emerald: {
    tile: "border-emerald-400/25 bg-emerald-400/10 text-emerald-300",
    glow: "from-emerald-400/[0.12]",
  },
  amber: {
    tile: "border-amber-400/25 bg-amber-400/10 text-amber-300",
    glow: "from-amber-400/[0.12]",
  },
  rose: {
    tile: "border-rose-400/25 bg-rose-400/10 text-rose-300",
    glow: "from-rose-400/[0.12]",
  },
};

export function Stat({
  label,
  value,
  hint,
  icon,
  accent = "brand",
  footer,
  delta,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  accent?: StatAccent;
  footer?: ReactNode;
  delta?: ReactNode;
}) {
  const palette = STAT_ACCENTS[accent];
  return (
    <Card className="group relative min-w-0 overflow-hidden">
      <div
        className={cn(
          "pointer-events-none absolute -top-16 -right-12 size-40 rounded-full bg-gradient-to-b to-transparent opacity-70 blur-2xl transition-opacity group-hover:opacity-100",
          palette.glow,
        )}
      />
      <div className="relative flex items-start justify-between gap-3">
        <div className="text-[11px] font-semibold tracking-[0.09em] text-dim uppercase">
          {label}
        </div>
        {icon ? (
          <span
            className={cn(
              "grid size-8 shrink-0 place-items-center rounded-lg border",
              palette.tile,
            )}
          >
            {icon}
          </span>
        ) : null}
      </div>
      <div className="relative mt-3 flex items-end gap-2">
        <div className="truncate font-display text-[28px] leading-none font-semibold tracking-tight text-ink">
          {value}
        </div>
        {delta ? <div className="mb-0.5 shrink-0">{delta}</div> : null}
      </div>
      {hint ? <div className="relative mt-2 text-xs text-dim">{hint}</div> : null}
      {footer ? <div className="relative mt-3">{footer}</div> : null}
    </Card>
  );
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  className,
  size = "md",
  ariaLabel,
}: {
  value: T;
  onChange: (next: T) => void;
  options: Array<{ value: T; label: ReactNode; icon?: LucideIcon }>;
  className?: string;
  size?: "sm" | "md";
  ariaLabel?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-lg border border-edge bg-canvas/60 p-0.5",
        className,
      )}
    >
      {options.map((option) => {
        const Icon = option.icon;
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 rounded-[7px] font-medium whitespace-nowrap transition-all duration-150",
              size === "sm" ? "h-6.5 px-2 text-[11px]" : "h-8 px-3 text-xs",
              active
                ? "bg-white/[0.08] text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_4px_12px_-6px_rgba(0,0,0,0.6)]"
                : "text-dim hover:text-ink",
            )}
          >
            {Icon ? <Icon className="size-3.5" /> : null}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 pt-[10vh] sm:p-6 sm:pt-[12vh]">
      <button
        type="button"
        aria-label="Close dialog"
        onClick={onClose}
        className="animate-fade-in fixed inset-0 bg-black/60 backdrop-blur-sm"
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "glass-strong animate-scale-in relative w-full rounded-2xl border border-edge-strong shadow-[0_40px_120px_-30px_rgba(0,0,0,0.9)]",
          width,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-edge px-5 py-4">
          <div>
            <h2 className="font-display text-base font-semibold text-ink">{title}</h2>
            {description ? (
              <p className="mt-1 text-xs leading-relaxed text-dim">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-7 shrink-0 place-items-center rounded-md text-dim transition-colors hover:bg-white/[0.06] hover:text-ink"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer ? (
          <div className="flex items-center justify-end gap-2 border-t border-edge px-5 py-3.5">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

export function Progress({
  value,
  className,
  tone = "brand",
}: {
  value: number;
  className?: string;
  tone?: "brand" | "emerald" | "amber" | "rose";
}) {
  const tones = {
    brand: "from-brand to-brand-3",
    emerald: "from-emerald-400 to-teal-300",
    amber: "from-amber-400 to-orange-300",
    rose: "from-rose-400 to-pink-300",
  } as const;
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]", className)}>
      <div
        className={cn("h-full rounded-full bg-gradient-to-r transition-all", tones[tone])}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

export function Sparkline({
  values,
  className,
  stroke = "#7c8cff",
  height = 40,
}: {
  values: number[];
  className?: string;
  stroke?: string;
  height?: number;
}) {
  const id = useId().replace(/[:]/g, "");
  const width = 100;
  const max = Math.max(1, ...values);
  const min = Math.min(...values, 0);
  const span = Math.max(1, max - min);
  const points =
    values.length === 0
      ? []
      : values.map((value, index) => {
          const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
          const y = height - 4 - ((value - min) / span) * (height - 10);
          return [x, y] as const;
        });
  const line = points
    .map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`)
    .join(" ");
  const first = points[0];
  const last = points[points.length - 1];
  const area =
    first && last
      ? `${line} L${last[0].toFixed(2)},${height} L${first[0].toFixed(2)},${height} Z`
      : "";

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={cn("w-full", className)}
      style={{ height }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.32" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      {area ? <path d={area} fill={`url(#spark-${id})`} /> : null}
      {line ? (
        <path
          d={line}
          fill="none"
          stroke={stroke}
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
      {last ? (
        <circle
          cx={last[0]}
          cy={last[1]}
          r="1.8"
          fill={stroke}
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
    </svg>
  );
}

type ProviderKind = "openai" | "anthropic" | "github-copilot" | "qoder" | string;

const PROVIDER_MARKS: Record<string, { icon: LucideIcon; tile: string; name: string }> = {
  openai: {
    icon: Sparkles,
    tile: "from-[#7c8cff]/25 to-[#4cc9f0]/15 text-[#b9c3ff] border-[#7c8cff]/25",
    name: "OpenAI",
  },
  anthropic: {
    icon: Asterisk,
    tile: "from-[#ffb37a]/25 to-[#f97316]/10 text-[#ffca9d] border-[#ffb37a]/25",
    name: "Anthropic",
  },
  "github-copilot": {
    icon: GitBranch,
    tile: "from-white/[0.16] to-white/[0.04] text-ink border-white/15",
    name: "GitHub Copilot",
  },
  qoder: {
    icon: SquareTerminal,
    tile: "from-[#b18cff]/25 to-[#ec4899]/10 text-[#dcc6ff] border-[#b18cff]/25",
    name: "Qoder",
  },
};

export function ProviderGlyph({
  kind,
  size = "md",
  className,
}: {
  kind: ProviderKind;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const mark = PROVIDER_MARKS[kind] ?? {
    icon: CircleDot,
    tile: "from-white/[0.08] to-transparent text-dim border-edge",
    name: kind,
  };
  const Icon = mark.icon;
  const sizes = {
    sm: "size-6 rounded-md [&_svg]:size-3.5",
    md: "size-8 rounded-lg [&_svg]:size-4",
    lg: "size-11 rounded-xl [&_svg]:size-5",
  } as const;
  return (
    <span
      title={mark.name}
      className={cn(
        "grid shrink-0 place-items-center border bg-gradient-to-br",
        mark.tile,
        sizes[size],
        className,
      )}
    >
      <Icon />
    </span>
  );
}

export function Avatar({
  name,
  email,
  size = "md",
}: {
  name?: string | null;
  email?: string;
  size?: "sm" | "md";
}) {
  const source = (name || email || "?").trim();
  const initials = source
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-full border border-white/10 bg-[linear-gradient(135deg,#7c8cff_0%,#b18cff_55%,#4cc9f0_100%)] font-semibold text-[#080b12]",
        size === "sm" ? "size-7 text-[10px]" : "size-9 text-xs",
      )}
    >
      {initials || "?"}
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-edge bg-panel px-1 font-mono text-[10px] text-dim">
      {children}
    </kbd>
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
