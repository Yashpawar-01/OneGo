import type { ChatMessage, ContentPart } from "@onego/shared";

export type MemoryEntry = {
  key: string;
  value: string;
  pinned?: boolean;
};

export type FileChangeSummary = {
  path: string;
  changeType: string;
};

export type ContextBuildInput = {
  messages: ChatMessage[];
  projectMemory?: MemoryEntry[];
  completedTasks?: string[];
  pendingTasks?: string[];
  fileChanges?: FileChangeSummary[];
  systemInstructions?: string;
  /** Token budget for the destination model. */
  maxTokens: number;
  /** Keep at least this many recent messages when compression is needed. */
  minRecentMessages?: number;
};

export type ContextPackage = {
  system: string;
  messages: ChatMessage[];
  tokenEstimate: number;
  omittedMessages: number;
  includedMessages: number;
};

export function textOfContent(content: string | ContentPart[]): string {
  if (typeof content === "string") return content;
  return content
    .map((part) => (part.type === "text" ? part.text : "[image]"))
    .join("\n");
}

/** Cheap, provider-independent estimate (~4 chars per token). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function estimateMessageTokens(message: ChatMessage): number {
  return estimateTokens(textOfContent(message.content)) + 4;
}

function buildSystemSection(input: ContextBuildInput): string {
  const lines: string[] = [];
  if (input.systemInstructions) {
    lines.push(input.systemInstructions.trim());
  } else {
    lines.push(
      "You are the AI engine inside OneGo, a multi-provider coding platform.",
      "Continue the user's task using the shared conversation and project context below.",
      "Do not repeat work that is already recorded as completed.",
    );
  }

  if (input.projectMemory?.length) {
    lines.push("", "## Project memory");
    for (const entry of input.projectMemory) {
      lines.push(`- ${entry.key}: ${entry.value}`);
    }
  }

  if (input.completedTasks?.length) {
    lines.push("", "## Completed work");
    for (const task of input.completedTasks) lines.push(`- ${task}`);
  }

  if (input.pendingTasks?.length) {
    lines.push("", "## Pending work");
    for (const task of input.pendingTasks) lines.push(`- ${task}`);
  }

  if (input.fileChanges?.length) {
    lines.push("", "## Recent file changes");
    for (const change of input.fileChanges.slice(-50)) {
      lines.push(`- ${change.changeType}: ${change.path}`);
    }
  }

  return lines.join("\n");
}

/**
 * Assembles a token-budgeted context package. The newest message is always
 * preserved; older history is included newest-first until the budget is spent.
 */
export function buildContextPackage(input: ContextBuildInput): ContextPackage {
  const system = buildSystemSection(input);
  let remaining = Math.max(0, input.maxTokens - estimateTokens(system));

  const minRecent = Math.min(
    input.minRecentMessages ?? 2,
    input.messages.length,
  );
  const includedReversed: ChatMessage[] = [];
  let omitted = 0;

  for (let i = input.messages.length - 1; i >= 0; i -= 1) {
    const message = input.messages[i] as ChatMessage;
    const cost = estimateMessageTokens(message);
    const forced = input.messages.length - i <= minRecent;
    if (forced || cost <= remaining) {
      includedReversed.push(message);
      remaining -= cost;
    } else {
      omitted += 1;
    }
  }

  const messages = includedReversed.reverse();
  const tokenEstimate =
    estimateTokens(system) +
    messages.reduce((sum, message) => sum + estimateMessageTokens(message), 0);

  return {
    system,
    messages,
    tokenEstimate,
    omittedMessages: omitted,
    includedMessages: messages.length,
  };
}
