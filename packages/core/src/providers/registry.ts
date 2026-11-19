import type { ProviderKind } from "@onego/shared";
import type { ProviderAdapter } from "./adapter.js";

export type AdapterRegistrationOptions = {
  /** Lower numbers are tried first during automatic fallback. */
  priority?: number;
  enabled?: boolean;
};

type Entry = {
  adapter: ProviderAdapter;
  priority: number;
  enabled: boolean;
};

const DEFAULT_PRIORITY = 100;

/**
 * Holds the provider adapters that are currently usable.
 * Ordering here is the source of truth for automatic fallback ordering.
 */
export class ProviderAdapterRegistry {
  private readonly entries = new Map<ProviderKind, Entry>();

  register(
    adapter: ProviderAdapter,
    options: AdapterRegistrationOptions = {},
  ): void {
    if (this.entries.has(adapter.kind)) {
      throw new Error(`Adapter for provider "${adapter.kind}" is already registered`);
    }
    this.entries.set(adapter.kind, {
      adapter,
      priority: options.priority ?? DEFAULT_PRIORITY,
      enabled: options.enabled ?? true,
    });
  }

  unregister(kind: ProviderKind): boolean {
    return this.entries.delete(kind);
  }

  has(kind: ProviderKind): boolean {
    return this.entries.has(kind);
  }

  get(kind: ProviderKind): ProviderAdapter | undefined {
    const entry = this.entries.get(kind);
    return entry?.enabled ? entry.adapter : undefined;
  }

  require(kind: ProviderKind): ProviderAdapter {
    const adapter = this.get(kind);
    if (!adapter) {
      throw new Error(`No enabled adapter registered for provider "${kind}"`);
    }
    return adapter;
  }

  listEnabled(): ProviderAdapter[] {
    return this.sortedEntries()
      .filter(([, entry]) => entry.enabled)
      .map(([, entry]) => entry.adapter);
  }

  listAll(): ProviderAdapter[] {
    return this.sortedEntries().map(([, entry]) => entry.adapter);
  }

  setEnabled(kind: ProviderKind, enabled: boolean): void {
    const entry = this.requireEntry(kind);
    entry.enabled = enabled;
  }

  setPriority(kind: ProviderKind, priority: number): void {
    const entry = this.requireEntry(kind);
    entry.priority = priority;
  }

  private requireEntry(kind: ProviderKind): Entry {
    const entry = this.entries.get(kind);
    if (!entry) {
      throw new Error(`No adapter registered for provider "${kind}"`);
    }
    return entry;
  }

  private sortedEntries(): Array<[ProviderKind, Entry]> {
    return [...this.entries.entries()].sort(
      ([, a], [, b]) => a.priority - b.priority,
    );
  }
}
