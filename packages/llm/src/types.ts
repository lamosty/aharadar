import type { BudgetTier } from "@aharadar/shared";

export type TaskType =
  | "triage"
  | "deep_summary"
  | "entity_extract"
  | "signal_parse"
  | "qa"
  | "aggregate_summary";

export interface ModelRef {
  provider: string;
  model: string;
  endpoint: string;
}

export interface LlmRequest {
  system: string;
  user: string;
  maxOutputTokens?: number;
  temperature?: number;
  reasoningEffort?: "none" | "low" | "medium" | "high";
  /** JSON Schema for structured output (used by Claude Agent SDK) */
  jsonSchema?: Record<string, unknown>;
}

export interface LlmCallResult {
  outputText: string;
  rawResponse: unknown;
  inputTokens: number;
  outputTokens: number;
  endpoint: string;
  /** Parsed structured output when jsonSchema was provided */
  structuredOutput?: unknown;
}

export interface LlmRouter {
  chooseModel(task: TaskType, tier: BudgetTier): ModelRef;
  call(task: TaskType, ref: ModelRef, request: LlmRequest): Promise<LlmCallResult>;
}
