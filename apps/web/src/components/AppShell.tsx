import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Activity,
  ChevronRight,
  Folder,
  History,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  X,
  type LucideIcon,
} from "lucide-react";
import { api } from "../lib/api.js";
import { useSession } from "../context/SessionContext.js";
import { AuthScreen } from "./AuthScreen.js";
import { Avatar, Badge, Kbd, cn } from "./ui.js";
import { notifyDataChanged } from "../lib/events.js";
import { CommandPalette, type PaletteAction } from "./CommandPalette.js";

type NavItem = { to: string; label: string; icon: LucideIcon; hint: string };
type NavGroup = { label: string; items: NavItem[] };

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Workspace",
    items: [
      { to: "/", label: "Overview", icon: LayoutDashboard, hint: "Live platform state" },
      { to: "/workspace", label: "AI Workspace", icon: MessageSquare, hint: "Chat across providers" },
      { to: "/conversations", label: "Conversations", icon: History, hint: "Every thread and switch" },
    ],
  },
  {
    label: "Providers",
    items: [
      { to: "/providers", label: "Accounts", icon: KeyRound, hint: "Encrypted credentials" },
      { to: "/router", label: "Model Router", icon: SlidersHorizontal, hint: "Routing rules and preview" },
      { to: "/usage", label: "Usage Analytics", icon: Activity, hint: "Recorded requests and cost" },
    ],
  },
  {
    label: "Context",
    items: [
      { to: "/projects", label: "Projects", icon: Folder, hint: "Memory and task state" },
      { to: "/settings", label: "Settings", icon: Settings, hint: "Account and security" },
    ],
  },
];

const TITLES: Record<string, string> = {
  "/": "Overview",
  "/workspace": "AI Workspace",
  "/providers": "Provider Accounts",
  "/router": "Model Router",
  "/usage": "Usage Analytics",
  "/projects": "Projects",
  "/conversations": "Conversations",
  "/settings": "Settings",
};

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <span className="relative grid size-9 place-items-center rounded-xl border border-white/10 bg-[linear-gradient(135deg,#93a2ff,#6f7ff2_55%,#4cc9f0)] font-display text-base font-bold text-[#080b12] shadow-glow">
        O
      </span>
      <div>
        <div className="font-display text-[15px] leading-none font-semibold tracking-tight">
          OneGo
        </div>
        <p className="mt-1 text-[10px] tracking-[0.16em] text-faint uppercase">
          AI coding hub
        </p>
      </div>
    </div>
  );
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="scrollbar-thin flex-1 space-y-5 overflow-y-auto px-3 py-5">
      {NAV_GROUPS.map((group) => (
        <div key={group.label}>
          <div className="px-3 pb-1.5 text-[10px] font-semibold tracking-[0.16em] text-faint uppercase">
            {group.label}
          </div>
          <div className="space-y-0.5">
            {group.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    "group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-150",
                    isActive
                      ? "bg-white/[0.065] text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
                      : "text-dim hover:bg-white/[0.035] hover:text-ink",
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={cn(
                        "absolute top-1/2 left-0 h-4 w-[2px] -translate-y-1/2 rounded-full transition-opacity",
                        isActive
                          ? "bg-gradient-to-b from-brand to-brand-3 opacity-100 shadow-[0_0_10px_rgba(124,140,255,0.9)]"
                          : "opacity-0",
                      )}
                    />
                    <item.icon
                      className={cn(
                        "size-4 shrink-0 transition-colors",
                        isActive ? "text-[#aeb9ff]" : "text-faint group-hover:text-dim",
                      )}
                    />
                    <span className="truncate">{item.label}</span>
                    {isActive ? (
                      <ChevronRight className="ml-auto size-3.5 text-faint" />
                    ) : null}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

export function AppShell() {
  const { user, loading, logout } = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const [providerSummary, setProviderSummary] = useState<{
    connected: number;
    total: number;
  } | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const mainRef = useRef<HTMLElement | null>(null);

  const loadSummary = useCallback(() => {
    api
      .overview()
      .then((result) =>
        setProviderSummary({
          connected: result.counts.connectedAccounts,
          total: result.counts.accounts,
        }),
      )
      .catch(() => setProviderSummary(null));
  }, []);

  useEffect(() => {
    if (!user) return;
    loadSummary();
  }, [user, location.pathname, loadSummary]);

  useEffect(() => {
    if (!user) return;
    const handler = () => loadSummary();
    window.addEventListener("onego:data-changed", handler);
    return () => window.removeEventListener("onego:data-changed", handler);
  }, [user, loadSummary]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    setPaletteOpen(false);
    setDrawerOpen(false);
    mainRef.current?.scrollTo({ top: 0 });
  }, [location.pathname]);

  const signOut = () => {
    logout();
    notifyDataChanged();
  };

  const actions = useMemo<PaletteAction[]>(() => {
    const navigation = NAV_GROUPS.flatMap((group) =>
      group.items.map((item) => ({
        id: item.to,
        label: item.label,
        hint: item.hint,
        group: group.label,
        icon: item.icon,
        run: () => navigate(item.to),
      })),
    );
    return [
      ...navigation,
      {
        id: "new-conversation",
        label: "New conversation",
        hint: "Open the workspace with a fresh thread",
        group: "Actions",
        icon: Plus,
        run: () => navigate("/workspace?new=1"),
      },
      {
        id: "sign-out",
        label: "Sign out",
        hint: user?.email,
        group: "Account",
        icon: LogOut,
        run: signOut,
      },
    ];
    // signOut is stable enough for a palette action list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, user?.email]);

  if (loading) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-canvas text-ink">
        <div className="pointer-events-none absolute inset-0 bg-aurora" />
        <div className="pointer-events-none absolute inset-0 bg-grid opacity-60" />
        <div className="relative flex flex-col items-center gap-5">
          <span className="grid size-12 animate-pulse-soft place-items-center rounded-2xl border border-white/10 bg-[linear-gradient(135deg,#93a2ff,#6f7ff2_55%,#4cc9f0)] font-display text-xl font-bold text-[#080b12] shadow-glow">
            O
          </span>
          <div className="flex items-center gap-2.5 text-sm text-dim">
            <span className="size-4 animate-spin rounded-full border-2 border-edge border-t-brand" />
            Opening OneGo…
          </div>
        </div>
      </div>
    );
  }

  if (!user) return <AuthScreen />;

  const connected = providerSummary?.connected ?? 0;
  const title = TITLES[location.pathname] ?? "OneGo";

  return (
    <div className="relative flex h-screen overflow-hidden bg-canvas text-ink">
      <div className="pointer-events-none absolute inset-0 bg-aurora opacity-50" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-grid opacity-40" />

      <aside className="relative z-20 hidden w-[264px] shrink-0 flex-col border-r border-edge/80 bg-panel/55 backdrop-blur-xl md:flex">
        <div className="flex h-16 items-center border-b border-edge/80 px-5">
          <Brand />
        </div>
        <div className="px-3 pt-4">
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="flex w-full items-center gap-2 rounded-lg border border-edge bg-canvas/60 px-3 py-2 text-left text-xs text-faint transition-colors hover:border-edge-strong hover:text-dim"
          >
            <Search className="size-3.5" />
            <span className="flex-1">Search or jump to…</span>
            <span className="flex items-center gap-1">
              <Kbd>⌘</Kbd>
              <Kbd>K</Kbd>
            </span>
          </button>
        </div>
        <NavList />
        <div className="border-t border-edge/80 p-3">
          <div className="flex items-center gap-3 rounded-xl border border-edge/70 bg-panel-2/60 px-3 py-2.5">
            <Avatar name={user.name} email={user.email} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium text-ink">
                {user.name || user.email}
              </div>
              <div className="text-[10px] tracking-[0.12em] text-faint uppercase">
                {user.role}
              </div>
            </div>
            <button
              type="button"
              onClick={signOut}
              title="Sign out"
              className="grid size-7 shrink-0 place-items-center rounded-md text-faint transition-colors hover:bg-white/[0.06] hover:text-ink"
            >
              <LogOut className="size-3.5" />
            </button>
          </div>
          <div className="mt-2 flex items-center justify-between px-1 text-[10px] text-faint">
            <span>v0.1.0 · local build</span>
            <span className="flex items-center gap-1">
              <ShieldCheck className="size-3" />
              encrypted
            </span>
          </div>
        </div>
      </aside>

      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-edge/80 bg-canvas/55 px-4 backdrop-blur-xl md:px-7">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="grid size-8 place-items-center rounded-lg border border-edge text-dim transition-colors hover:text-ink md:hidden"
              aria-label="Open navigation"
            >
              <Menu className="size-4" />
            </button>
            <div className="hidden items-center gap-2 text-xs text-faint sm:flex">
              <span>OneGo</span>
              <ChevronRight className="size-3" />
              <span className="font-medium text-ink">{title}</span>
            </div>
            <div className="truncate font-display text-sm font-semibold sm:hidden">{title}</div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="hidden items-center gap-2 rounded-full border border-edge bg-panel/60 px-3 py-1.5 text-[11px] text-faint transition-colors hover:border-edge-strong hover:text-dim lg:flex"
            >
              <Search className="size-3.5" />
              Quick switch
              <span className="flex items-center gap-1">
                <Kbd>⌘</Kbd>
                <Kbd>K</Kbd>
              </span>
            </button>
            <span className="flex items-center gap-2 rounded-full border border-edge bg-panel/60 px-3 py-1.5 text-[11px] text-dim">
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  connected > 0 ? "animate-pulse-soft bg-emerald-400" : "bg-amber-400",
                )}
              />
              <span className="hidden sm:inline">
                {providerSummary
                  ? `${connected}/${providerSummary.total} providers connected`
                  : "Provider status unavailable"}
              </span>
              <span className="sm:hidden">
                {providerSummary ? `${connected}/${providerSummary.total}` : "—"}
              </span>
            </span>
            <Badge tone="info" className="hidden xl:inline-flex">
              <ShieldCheck className="size-3" />
              official channels
            </Badge>
          </div>
        </header>

        <main ref={mainRef} className="scrollbar-thin relative min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1500px] px-4 py-6 md:px-8 md:py-8">
            <Outlet />
          </div>
        </main>
      </div>

      {drawerOpen ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setDrawerOpen(false)}
            className="animate-fade-in absolute inset-0 bg-black/65 backdrop-blur-sm"
          />
          <div className="glass-strong animate-fade-up absolute inset-y-0 left-0 flex w-[280px] flex-col border-r border-edge-strong">
            <div className="flex h-16 items-center justify-between border-b border-edge px-4">
              <Brand />
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="grid size-8 place-items-center rounded-lg text-dim hover:bg-white/[0.06] hover:text-ink"
                aria-label="Close navigation"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="px-3 pt-4">
              <button
                type="button"
                onClick={() => {
                  setDrawerOpen(false);
                  setPaletteOpen(true);
                }}
                className="flex w-full items-center gap-2 rounded-lg border border-edge bg-canvas/60 px-3 py-2 text-left text-xs text-faint"
              >
                <Search className="size-3.5" />
                Search or jump to…
              </button>
            </div>
            <NavList onNavigate={() => setDrawerOpen(false)} />
            <div className="border-t border-edge p-3">
              <div className="flex items-center gap-3 rounded-xl border border-edge bg-panel-2/70 px-3 py-2.5">
                <Avatar name={user.name} email={user.email} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium">{user.name || user.email}</div>
                  <div className="text-[10px] tracking-[0.12em] text-faint uppercase">
                    {user.role}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={signOut}
                  className="grid size-7 place-items-center rounded-md text-faint hover:text-ink"
                  aria-label="Sign out"
                >
                  <LogOut className="size-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        actions={actions}
      />
    </div>
  );
}
