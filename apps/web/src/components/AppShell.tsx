import { NavLink, Outlet } from "react-router-dom";

const NAV_ITEMS = [
  { to: "/", label: "Overview" },
  { to: "/workspace", label: "AI Workspace" },
  { to: "/providers", label: "Providers" },
  { to: "/router", label: "Model Router" },
  { to: "/usage", label: "Usage Analytics" },
  { to: "/projects", label: "Projects" },
  { to: "/conversations", label: "Conversations" },
  { to: "/settings", label: "Settings" },
] as const;

export function AppShell() {
  return (
    <div className="flex min-h-screen bg-canvas text-ink">
      <aside className="flex w-60 shrink-0 flex-col border-r border-edge bg-panel/60">
        <div className="border-b border-edge px-5 py-5">
          <div className="text-lg font-semibold tracking-tight">OneGo</div>
          <p className="mt-1 text-xs text-dim">Unified AI coding hub</p>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                [
                  "block rounded-md px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-brand/10 text-brand"
                    : "text-dim hover:bg-white/5 hover:text-ink",
                ].join(" ")
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-edge p-4 text-xs text-dim">
          Phase 1 · foundation
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-edge px-6">
          <div className="text-sm text-dim">
            Dashboard data arrives in Phase 2 — nothing is simulated.
          </div>
          <div className="flex items-center gap-2 text-xs text-dim">
            <span className="size-2 rounded-full bg-amber-400" />
            0 providers connected
          </div>
        </header>
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
