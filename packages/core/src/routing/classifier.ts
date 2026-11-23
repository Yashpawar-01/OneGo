import type {
  ProviderModelInfo,
  TaskClassification,
  TaskType,
} from "@onego/shared";

const RULES: Array<{ type: TaskType; patterns: RegExp[]; weight: number }> = [
  {
    type: "architecture",
    patterns: [
      /\barchitecture\b/i,
      /\bdesign (?:a|the) (?:system|service|schema)\b/i,
      /\bscalab/i,
      /\bmicroservices?\b/i,
      /\bmonorepo\b/i,
    ],
    weight: 1,
  },
  {
    type: "debugging",
    patterns: [
      /\b(?:fix|debug|error|exception|traceback|stack trace|bug)\b/i,
      /\bnot working\b/i,
      /\bfails?\b/i,
      /\bcrash/i,
    ],
    weight: 1,
  },
  {
    type: "code_review",
    patterns: [/\breview\b/i, /\baudit\b/i, /\bsecurity issue/i, /\brefactor/i],
    weight: 1,
  },
  {
    type: "large_repo_analysis",
    patterns: [
      /\b(?:entire|whole) (?:repo|repository|codebase)\b/i,
      /\banaly[sz]e the (?:repo|repository|project)\b/i,
      /\bwhere is .* defined\b/i,
    ],
    weight: 1,
  },
  {
    type: "documentation",
    patterns: [/\bdocument(?:ation)?\b/i, /\breadme\b/i, /\bchangelog\b/i],
    weight: 1,
  },
  {
    type: "code_generation",
    patterns: [
      /\b(?:implement|create|add|build|write)\b.*\b(?:component|endpoint|function|class|feature|test)\b/i,
      /\bgenerate\b/i,
      /\bscaffold\b/i,
    ],
    weight: 1,
  },
];

export function classifyTask(prompt: string): TaskClassification {
  let bestType: TaskType = "unknown";
  let bestScore = 0;
  const signals: string[] = [];

  for (const rule of RULES) {
    let score = 0;
    for (const pattern of rule.patterns) {
      if (pattern.test(prompt)) {
        score += rule.weight;
        signals.push(`${rule.type}: ${pattern.source}`);
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestType = rule.type;
    }
  }

  if (bestScore === 0) {
    return { type: "unknown", confidence: 0.2, signals: ["no keyword match"] };
  }

  return {
    type: bestType,
    confidence: Math.min(0.9, 0.4 + bestScore * 0.15),
    signals: signals.slice(0, 5),
  };
}

const TASK_PREFERENCES: Record<
  TaskType,
  { preferTools: boolean; preferLargeContext: boolean; preferCheap: boolean }
> = {
  architecture: { preferTools: true, preferLargeContext: true, preferCheap: false },
  debugging: { preferTools: true, preferLargeContext: true, preferCheap: false },
  code_generation: { preferTools: true, preferLargeContext: false, preferCheap: false },
  code_review: { preferTools: true, preferLargeContext: true, preferCheap: false },
  large_repo_analysis: {
    preferTools: false,
    preferLargeContext: true,
    preferCheap: false,
  },
  documentation: {
    preferTools: false,
    preferLargeContext: false,
    preferCheap: true,
  },
  unknown: { preferTools: false, preferLargeContext: false, preferCheap: true },
};

export type ScoredModel = {
  model: ProviderModelInfo;
  score: number;
  reasons: string[];
};

/**
 * Ranks models for a task. Cost is only a tie-breaker — a pricier model is not
 * assumed to be better; capability fit dominates.
 */
export function rankModelsForTask(
  models: ProviderModelInfo[],
  task: TaskClassification,
  options: { excludeModelIds?: string[] } = {},
): ScoredModel[] {
  const prefs = TASK_PREFERENCES[task.type];
  const excluded = new Set(options.excludeModelIds ?? []);

  return models
    .filter((model) => !excluded.has(model.id))
    .map((model) => {
      const reasons: string[] = [];
      let score = 0;

      if (model.supportsTools) {
        score += prefs.preferTools ? 30 : 2;
        if (prefs.preferTools) reasons.push("tool support");
      }

      const contextWindow = model.contextWindow ?? 0;
      if (contextWindow >= 200_000) {
        score += prefs.preferLargeContext ? 40 : 3;
        if (prefs.preferLargeContext) reasons.push("large context");
      } else if (contextWindow >= 100_000) {
        score += prefs.preferLargeContext ? 25 : 1;
      }

      const cost =
        (model.inputCostPerMTok ?? 0) + (model.outputCostPerMTok ?? 0);
      if (prefs.preferCheap) {
        score += cost === 0 ? 10 : Math.max(0, 10 - cost);
        reasons.push("cost-efficient");
      } else {
        score += Math.max(0, 5 - cost / 10);
      }

      return { model, score, reasons };
    })
    .sort((a, b) => b.score - a.score);
}
