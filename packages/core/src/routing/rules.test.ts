import { describe, expect, it } from "vitest";
import {
  matchesRoutingRule,
  selectRoutingRule,
  type RuleEvaluationContext,
  type SelectableRoutingRule,
} from "./rules.js";

const base: RuleEvaluationContext = {
  prompt: "Please fix the failing login test",
  taskType: "debugging",
  projectId: "proj_1",
  messageCount: 4,
};

function rule(
  overrides: Partial<SelectableRoutingRule> & { conditions?: unknown },
): SelectableRoutingRule {
  return {
    id: "rule_1",
    name: "Rule",
    priority: 100,
    enabled: true,
    conditions: {},
    mode: "automatic",
    targetProviderKind: "OPENAI",
    targetModelId: null,
    ...overrides,
  };
}

describe("matchesRoutingRule", () => {
  it("matches empty and missing conditions", () => {
    expect(matchesRoutingRule({}, base)).toBe(true);
    expect(matchesRoutingRule(undefined, base)).toBe(true);
  });

  it("matches task types as a single value or a list", () => {
    expect(matchesRoutingRule({ taskTypes: "debugging" }, base)).toBe(true);
    expect(matchesRoutingRule({ taskTypes: ["architecture", "debugging"] }, base)).toBe(true);
    expect(matchesRoutingRule({ taskTypes: ["documentation"] }, base)).toBe(false);
    expect(matchesRoutingRule({ taskTypes: ["debugging"] }, { ...base, taskType: undefined })).toBe(
      false,
    );
  });

  it("performs case-insensitive substring matches", () => {
    expect(matchesRoutingRule({ promptIncludes: "LOGIN" }, base)).toBe(true);
    expect(matchesRoutingRule({ promptIncludes: ["signup", "login"] }, base)).toBe(true);
    expect(matchesRoutingRule({ promptIncludes: ["billing"] }, base)).toBe(false);
    expect(matchesRoutingRule({ promptIncludes: [] }, base)).toBe(false);
  });

  it("supports regular expressions and rejects invalid ones", () => {
    expect(matchesRoutingRule({ promptMatches: "fail(ing)?\\s+login" }, base)).toBe(true);
    expect(matchesRoutingRule({ promptMatches: "^refactor" }, base)).toBe(false);
    expect(matchesRoutingRule({ promptMatches: "([unclosed" }, base)).toBe(false);
    expect(matchesRoutingRule({ promptMatches: 42 }, base)).toBe(false);
  });

  it("matches project identity and presence", () => {
    expect(matchesRoutingRule({ projectId: "proj_1" }, base)).toBe(true);
    expect(matchesRoutingRule({ projectId: "proj_2" }, base)).toBe(false);
    expect(matchesRoutingRule({ hasProject: true }, base)).toBe(true);
    expect(matchesRoutingRule({ hasProject: false }, base)).toBe(false);
    expect(
      matchesRoutingRule({ hasProject: false }, { ...base, projectId: null }),
    ).toBe(true);
  });

  it("enforces message and prompt length bounds", () => {
    expect(matchesRoutingRule({ minMessages: 4, maxMessages: 4 }, base)).toBe(true);
    expect(matchesRoutingRule({ minMessages: 5 }, base)).toBe(false);
    expect(matchesRoutingRule({ maxMessages: 3 }, base)).toBe(false);
    expect(matchesRoutingRule({ minPromptLength: 10, maxPromptLength: 100 }, base)).toBe(true);
    expect(matchesRoutingRule({ minPromptLength: 200 }, base)).toBe(false);
    expect(matchesRoutingRule({ maxPromptLength: 5 }, base)).toBe(false);
    expect(matchesRoutingRule({ maxMessages: "3" }, base)).toBe(false);
  });

  it("fails closed for unknown keys and malformed conditions", () => {
    expect(matchesRoutingRule({ imaginaryKey: true }, base)).toBe(false);
    expect(matchesRoutingRule([{ taskTypes: ["debugging"] }], base)).toBe(false);
    expect(matchesRoutingRule("taskTypes", base)).toBe(false);
  });
});

describe("selectRoutingRule", () => {
  const context = base;

  it("returns the lowest priority matching rule", () => {
    const selected = selectRoutingRule(
      [
        rule({ id: "late", name: "Late", priority: 50 }),
        rule({ id: "early", name: "Early", priority: 10 }),
      ],
      context,
    );
    expect(selected?.id).toBe("early");
  });

  it("skips disabled rules and non-matching rules", () => {
    const selected = selectRoutingRule(
      [
        rule({ id: "off", priority: 1, enabled: false }),
        rule({ id: "docs", priority: 2, conditions: { taskTypes: ["documentation"] } }),
        rule({ id: "win", priority: 3 }),
      ],
      context,
    );
    expect(selected?.id).toBe("win");
  });

  it("returns null when nothing matches", () => {
    expect(
      selectRoutingRule([rule({ conditions: { promptIncludes: "billing" } })], context),
    ).toBeNull();
    expect(selectRoutingRule([], context)).toBeNull();
  });

  it("keeps caller order for equal priorities", () => {
    const selected = selectRoutingRule(
      [
        rule({ id: "first", priority: 100 }),
        rule({ id: "second", priority: 100 }),
      ],
      context,
    );
    expect(selected?.id).toBe("first");
  });
});
