import { describe, expect, it } from "vitest";
import type { ProviderModelInfo } from "@onego/shared";
import { classifyTask, rankModelsForTask } from "../routing/classifier.js";

describe("classifyTask", () => {
  it("detects debugging requests", () => {
    expect(classifyTask("Please fix this exception in the payment webhook").type).toBe(
      "debugging",
    );
  });

  it("detects architecture requests", () => {
    expect(
      classifyTask("Design the system architecture for a multi-tenant service").type,
    ).toBe("architecture");
  });

  it("detects documentation requests", () => {
    expect(classifyTask("Write the README and changelog for this repo").type).toBe(
      "documentation",
    );
  });

  it("falls back to unknown", () => {
    expect(classifyTask("hello there").type).toBe("unknown");
  });
});

describe("rankModelsForTask", () => {
  const models: ProviderModelInfo[] = [
    {
      id: "fast-cheap",
      displayName: "Fast",
      supportsTools: false,
      supportsVision: false,
      inputCostPerMTok: 0.1,
      outputCostPerMTok: 0.2,
    },
    {
      id: "reasoner",
      displayName: "Reasoner",
      contextWindow: 200_000,
      supportsTools: true,
      supportsVision: false,
      inputCostPerMTok: 3,
      outputCostPerMTok: 15,
    },
  ];

  it("prefers large-context, tool-capable models for architecture work", () => {
    const ranked = rankModelsForTask(models, {
      type: "architecture",
      confidence: 0.8,
    });
    expect(ranked[0]?.model.id).toBe("reasoner");
    expect(ranked[0]?.reasons).toContain("large context");
  });

  it("prefers cheap models for documentation when capabilities suffice", () => {
    const ranked = rankModelsForTask(models, {
      type: "documentation",
      confidence: 0.8,
    });
    expect(ranked[0]?.model.id).toBe("fast-cheap");
  });

  it("honors exclusions", () => {
    const ranked = rankModelsForTask(
      models,
      { type: "architecture", confidence: 0.8 },
      { excludeModelIds: ["reasoner"] },
    );
    expect(ranked[0]?.model.id).toBe("fast-cheap");
  });
});
