import type { BudgetTier } from "@aharadar/shared";

export type TaskType = "triage" | "deep_summary" | "entity_extract" | "signal_parse";

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
}

export interface LlmCallResult {
  outputText: string;
  rawResponse: unknown;
  inputTokens: number;
  outputTokens: number;
  endpoint: string;
}

export interface LlmRouter {
  chooseModel(task: TaskType, tier: BudgetTier): ModelRef;
  call(task: TaskType, ref: ModelRef, request: LlmRequest): Promise<LlmCallResult>;
}
