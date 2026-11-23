import { useCallback, useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { api } from "../lib/api.js";
import { useSession } from "../context/SessionContext.js";
import { AuthScreen } from "./AuthScreen.js";
import { Spinner } from "./ui.js";
import { notifyDataChanged } from "../lib/events.js";

type NavItem = { to: string; label: string };
type NavGroup = { label: string; items: NavItem[] };

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Workspace",
    items: [
      { to: "/", label: "Overview" },
      { to: "/workspace", label: "AI Workspace" },
      { to: "/conversations", label: "Conversations" },
    ],
  },
  {
    label: "Providers",
    items: [
      { to: "/providers", label: "Accounts" },
      { to: "/router", label: "Model Router" },
      { to: "/usage", label: "Usage Analytics" },
    ],
  },
  {
    label: "Context",
    items: [
      { to: "/projects", label: "Projects" },
      { to: "/settings", label: "Settings" },
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

export function AppShell() {
  const { user, loading, logout } = useSession();
  const location = useLocation();
  const [providerSummary, setProviderSummary] = useState<{
    connected: number;
    total: number;
  } | null>(null);

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

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <Spinner label="Opening OneGo…" />
      </div>
    );
  }

  if (!user) return <AuthScreen />;

  return (
    <div className="flex min-h-screen bg-canvas text-ink">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-edge bg-panel/60 md:flex">
        <div className="border-b border-edge px-5 py-5">
          <div className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-md bg-brand text-sm font-bold text-[#0a0c10]">
              O
            </span>
            <div>
              <div className="text-base font-semibold leading-none tracking-tight">OneGo</div>
              <p className="mt-1 text-[11px] text-dim">Unified AI coding hub</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 space-y-5 overflow-auto p-3">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-dim/70">
                {group.label}
              </div>
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === "/"}
                    className={({ isActive }) =>
                      [
                        "block rounded-md px-3 py-1.5 text-sm transition-colors",
                        isActive
                          ? "bg-brand/10 text-brand"
                          : "text-dim hover:bg-white/5 hover:text-ink",
                      ].join(" ")
                    }
                  >
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="border-t border-edge p-4">
          <div className="truncate text-xs text-ink">{user.name || user.email}</div>
          <div className="mt-0.5 flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wide text-dim">{user.role}</span>
            <button
              type="button"
              onClick={() => {
                logout();
                notifyDataChanged();
              }}
              className="text-[11px] text-dim underline-offset-2 hover:text-ink hover:underline"
            >
              Sign out
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between gap-4 border-b border-edge px-4 md:px-6">
          <div className="flex items-center gap-3">
            <div className="text-sm font-medium text-ink md:hidden">OneGo</div>
            <div className="hidden text-sm text-dim md:block">
              {TITLES[location.pathname] ?? "OneGo"}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-xs text-dim">
              <span
                className={[
                  "size-2 rounded-full",
                  providerSummary && providerSummary.connected > 0
                    ? "bg-emerald-400"
                    : "bg-amber-400",
                ].join(" ")}
              />
              {providerSummary
                ? `${providerSummary.connected}/${providerSummary.total} providers connected`
                : "Provider status unavailable"}
            </span>
            <button
              type="button"
              onClick={() => {
                logout();
                notifyDataChanged();
              }}
              className="text-xs text-dim hover:text-ink md:hidden"
            >
              Sign out
            </button>
          </div>
        </header>
        <nav className="flex gap-1 overflow-x-auto border-b border-edge px-2 py-1.5 md:hidden">
          {NAV_GROUPS.flatMap((group) => group.items).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                [
                  "shrink-0 rounded-md px-2.5 py-1 text-xs",
                  isActive ? "bg-brand/10 text-brand" : "text-dim",
                ].join(" ")
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <main className="min-h-0 flex-1 overflow-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
