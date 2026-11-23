import { describe, expect, it } from "vitest";
import {
  buildContextPackage,
  estimateTokens,
} from "../context/context-builder.js";

describe("buildContextPackage", () => {
  it("includes project memory and task state in the system prompt", () => {
    const pkg = buildContextPackage({
      messages: [{ role: "user", content: "continue" }],
      projectMemory: [
        { key: "stack", value: "React + Express" },
        { key: "auth", value: "JWT" },
      ],
      completedTasks: ["created schema"],
      pendingTasks: ["wire routes"],
      fileChanges: [{ path: "src/auth.ts", changeType: "MODIFY" }],
      maxTokens: 4_000,
    });

    expect(pkg.system).toContain("stack: React + Express");
    expect(pkg.system).toContain("created schema");
    expect(pkg.system).toContain("wire routes");
    expect(pkg.system).toContain("MODIFY: src/auth.ts");
    expect(pkg.messages).toHaveLength(1);
  });

  it("keeps the newest messages and omits older ones when the budget is tight", () => {
    const big = "x".repeat(400);
    const messages = [
      { role: "user" as const, content: `old ${big}` },
      { role: "assistant" as const, content: `middle ${big}` },
      { role: "user" as const, content: "latest question" },
    ];

    const pkg = buildContextPackage({
      messages,
      maxTokens: 260,
      minRecentMessages: 1,
    });

    expect(pkg.messages.at(-1)?.content).toBe("latest question");
    expect(pkg.omittedMessages).toBeGreaterThan(0);
    expect(pkg.includedMessages).toBeLessThan(messages.length);
  });

  it("reports an accurate token estimate", () => {
    expect(estimateTokens("12345678")).toBe(2);
    const pkg = buildContextPackage({
      messages: [{ role: "user", content: "hi" }],
      maxTokens: 1_000,
    });
    expect(pkg.tokenEstimate).toBeGreaterThan(0);
  });
});
