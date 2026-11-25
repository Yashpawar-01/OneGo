import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { ArrowDown, ArrowUp, CornerDownLeft, Search, type LucideIcon } from "lucide-react";
import { Kbd, cn } from "./ui.js";

export type PaletteAction = {
  id: string;
  label: string;
  hint?: string;
  group: string;
  icon: LucideIcon;
  run: () => void;
};

export function CommandPalette({
  open,
  onClose,
  actions,
}: {
  open: boolean;
  onClose: () => void;
  actions: PaletteAction[];
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return actions;
    return actions.filter((action) =>
      `${action.label} ${action.group} ${action.hint ?? ""}`.toLowerCase().includes(needle),
    );
  }, [actions, query]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  if (!open) return null;

  const commit = (index: number) => {
    const action = filtered[index];
    if (!action) return;
    onClose();
    action.run();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((current) => (filtered.length === 0 ? 0 : (current + 1) % filtered.length));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((current) =>
        filtered.length === 0 ? 0 : (current - 1 + filtered.length) % filtered.length,
      );
    } else if (event.key === "Enter") {
      event.preventDefault();
      commit(active);
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[14vh]">
      <button
        type="button"
        aria-label="Close command palette"
        onClick={onClose}
        className="animate-fade-in fixed inset-0 bg-black/65 backdrop-blur-md"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="glass-strong animate-scale-in relative w-full max-w-xl overflow-hidden rounded-2xl border border-edge-strong shadow-[0_50px_140px_-40px_rgba(0,0,0,0.95)]"
      >
        <div className="flex items-center gap-3 border-b border-edge px-4 py-3.5">
          <Search className="size-4 shrink-0 text-faint" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Jump to a page or run an action…"
            className="w-full bg-transparent text-sm text-ink placeholder:text-faint focus:outline-none"
          />
          <Kbd>esc</Kbd>
        </div>

        <div className="scrollbar-thin max-h-[46vh] overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <div className="px-3 py-10 text-center text-sm text-dim">
              No matches for “{query.trim()}”.
            </div>
          ) : (
            filtered.map((action, index) => {
              const previous = filtered[index - 1];
              const showGroup = !previous || previous.group !== action.group;
              const Icon = action.icon;
              return (
                <div key={action.id}>
                  {showGroup ? (
                    <div className="px-3 pt-2.5 pb-1 text-[10px] font-semibold tracking-[0.14em] text-faint uppercase">
                      {action.group}
                    </div>
                  ) : null}
                  <button
                    type="button"
                    onMouseEnter={() => setActive(index)}
                    onClick={() => commit(index)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                      index === active
                        ? "bg-white/[0.07] text-ink"
                        : "text-dim hover:bg-white/[0.04] hover:text-ink",
                    )}
                  >
                    <span
                      className={cn(
                        "grid size-7 shrink-0 place-items-center rounded-md border",
                        index === active
                          ? "border-brand/35 bg-brand/15 text-[#ddd1ff]"
                          : "border-edge bg-panel text-dim",
                      )}
                    >
                      <Icon className="size-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium">
                        {action.label}
                      </span>
                      {action.hint ? (
                        <span className="block truncate text-[11px] text-faint">
                          {action.hint}
                        </span>
                      ) : null}
                    </span>
                    {index === active ? (
                      <CornerDownLeft className="size-3.5 shrink-0 text-faint" />
                    ) : null}
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div className="flex items-center gap-4 border-t border-edge px-4 py-2.5 text-[10px] text-faint">
          <span className="flex items-center gap-1">
            <ArrowUp className="size-3" />
            <ArrowDown className="size-3" />
            navigate
          </span>
          <span className="flex items-center gap-1">
            <CornerDownLeft className="size-3" />
            select
          </span>
          <span className="ml-auto flex items-center gap-1">
            <Kbd>⌘</Kbd>
            <Kbd>K</Kbd>
            toggle
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
