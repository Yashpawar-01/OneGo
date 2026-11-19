export type RoutingMode = "manual" | "automatic" | "intelligent";

export type TaskType =
  | "architecture"
  | "debugging"
  | "code_generation"
  | "code_review"
  | "large_repo_analysis"
  | "documentation"
  | "unknown";

export type TaskClassification = {
  type: TaskType;
  /** Heuristic confidence in [0,1]; providers may refine this later. */
  confidence: number;
  signals?: string[];
};

export type RoutingDecision = {
  mode: RoutingMode;
  taskType: TaskType;
  accountId: string;
  modelId: string;
  reason: string;
};
