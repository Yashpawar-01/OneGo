import type { TaskType } from "@onego/shared";

/**
 * Supported condition keys for stored routing rules. Unknown keys make a rule
 * fail to match on purpose: a typo must never broaden routing unexpectedly.
 */
export type RoutingRuleConditions = {
  /** Match when the local classifier returns any of these task types. */
  taskTypes?: TaskType[] | TaskType;
  /** Case-insensitive substring match; any listed needle is enough. */
  promptIncludes?: string[] | string;
  /** Case-insensitive regular expression applied to the prompt. */
  promptMatches?: string;
  /** Exact project id match. */
  projectId?: string;
  /** Require or forbid a project on the conversation. */
  hasProject?: boolean;
  /** Bounds on the number of stored messages in the conversation. */
  minMessages?: number;
  maxMessages?: number;
  /** Bounds on the raw prompt length. */
  minPromptLength?: number;
  maxPromptLength?: number;
};

export type RuleEvaluationContext = {
  prompt: string;
  taskType?: TaskType;
  projectId?: string | null;
  messageCount: number;
};

export type SelectableRoutingRule = {
  id: string;
  name: string;
  priority: number;
  enabled?: boolean;
  conditions?: unknown;
  mode?: string | null;
  targetProviderKind?: string | null;
  targetModelId?: string | null;
};

function asStringList(value: unknown): string[] | null {
  if (typeof value === "string") return [value];
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    return value as string[];
  }
  return null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Evaluates a stored conditions object against the current turn. An empty
 * object matches every turn; malformed or unsupported conditions never match.
 */
export function matchesRoutingRule(
  conditions: unknown,
  context: RuleEvaluationContext,
): boolean {
  if (conditions === null || conditions === undefined) return true;
  if (typeof conditions !== "object" || Array.isArray(conditions)) return false;

  const entries = Object.entries(conditions as Record<string, unknown>);
  if (entries.length === 0) return true;

  for (const [key, value] of entries) {
    switch (key) {
      case "taskTypes": {
        const types = asStringList(value);
        if (!types || types.length === 0) return false;
        if (!context.taskType || !types.includes(context.taskType)) return false;
        break;
      }
      case "promptIncludes": {
        const needles = asStringList(value);
        if (!needles || needles.length === 0) return false;
        const prompt = context.prompt.toLowerCase();
        if (!needles.some((needle) => prompt.includes(needle.toLowerCase()))) {
          return false;
        }
        break;
      }
      case "promptMatches": {
        if (typeof value !== "string" || value.length === 0) return false;
        try {
          if (!new RegExp(value, "i").test(context.prompt)) return false;
        } catch {
          return false;
        }
        break;
      }
      case "projectId": {
        if (typeof value !== "string" || value.length === 0) return false;
        if (context.projectId !== value) return false;
        break;
      }
      case "hasProject": {
        if (typeof value !== "boolean") return false;
        if (Boolean(context.projectId) !== value) return false;
        break;
      }
      case "minMessages": {
        if (!isFiniteNumber(value)) return false;
        if (context.messageCount < value) return false;
        break;
      }
      case "maxMessages": {
        if (!isFiniteNumber(value)) return false;
        if (context.messageCount > value) return false;
        break;
      }
      case "minPromptLength": {
        if (!isFiniteNumber(value)) return false;
        if (context.prompt.length < value) return false;
        break;
      }
      case "maxPromptLength": {
        if (!isFiniteNumber(value)) return false;
        if (context.prompt.length > value) return false;
        break;
      }
      default:
        return false;
    }
  }

  return true;
}

/**
 * Picks the highest-precedence enabled rule whose conditions match. Lower
 * priority numbers win, mirroring account priority; ties keep the caller's
 * order (createdAt ascending from the database).
 */
export function selectRoutingRule<T extends SelectableRoutingRule>(
  rules: readonly T[],
  context: RuleEvaluationContext,
): T | null {
  const ordered = rules
    .filter((rule) => rule.enabled !== false)
    .slice()
    .sort((a, b) => a.priority - b.priority);

  for (const rule of ordered) {
    if (matchesRoutingRule(rule.conditions ?? {}, context)) return rule;
  }
  return null;
}
