import { describe, expect, it } from "vitest";
import type { ProviderAdapter } from "../providers/adapter.js";
import { ProviderAdapterRegistry } from "../providers/registry.js";

function fakeAdapter(kind: ProviderAdapter["kind"]): ProviderAdapter {
  return {
    kind,
    capabilities: {
      chat: true,
      streaming: true,
      toolCalling: true,
      vision: false,
      usageReporting: "none",
      integration: "http",
    },
    authMethods: ["api_key"],
    validateConnection: async () => ({
      ok: true,
      status: "connected",
      checkedAt: new Date().toISOString(),
    }),
    getAvailableModels: async () => [],
    sendMessage: async () => ({
      text: "",
      toolCalls: [],
      finishReason: "stop",
    }),
    toProviderError: (error) => {
      throw error;
    },
  };
}

describe("ProviderAdapterRegistry", () => {
  it("orders enabled adapters by priority", () => {
    const registry = new ProviderAdapterRegistry();
    registry.register(fakeAdapter("anthropic"), { priority: 20 });
    registry.register(fakeAdapter("openai"), { priority: 10 });
    registry.register(fakeAdapter("qoder"), { priority: 30 });

    expect(registry.listEnabled().map((adapter) => adapter.kind)).toEqual([
      "openai",
      "anthropic",
      "qoder",
    ]);
  });

  it("excludes disabled adapters from enabled listings", () => {
    const registry = new ProviderAdapterRegistry();
    registry.register(fakeAdapter("openai"));
    registry.register(fakeAdapter("anthropic"), { enabled: false });

    expect(registry.listEnabled().map((adapter) => adapter.kind)).toEqual([
      "openai",
    ]);
    expect(registry.listAll()).toHaveLength(2);
    expect(registry.get("anthropic")).toBeUndefined();
    expect(registry.has("anthropic")).toBe(true);
  });

  it("rejects duplicate registrations for the same provider", () => {
    const registry = new ProviderAdapterRegistry();
    registry.register(fakeAdapter("github"));

    expect(() => registry.register(fakeAdapter("github"))).toThrow(
      /already registered/,
    );
  });

  it("re-sorts after a priority change", () => {
    const registry = new ProviderAdapterRegistry();
    registry.register(fakeAdapter("openai"), { priority: 10 });
    registry.register(fakeAdapter("anthropic"), { priority: 20 });

    registry.setPriority("anthropic", 5);

    expect(registry.listEnabled().map((adapter) => adapter.kind)).toEqual([
      "anthropic",
      "openai",
    ]);
  });
});
