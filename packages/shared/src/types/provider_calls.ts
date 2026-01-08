export type ProviderCallStatus = "ok" | "error";

export interface ProviderCallDraft {
  userId: string;
  purpose: string; // triage|deep_summary|entity_extract|signal_parse|embedding|signal_search|...
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costEstimateCredits: number;
  costEstimateUsd?: number; // USD cost based on model pricing (calculated at call time)
  meta: Record<string, unknown>;
  startedAt: string; // ISO
  endedAt?: string; // ISO
  status: ProviderCallStatus;
  error?: Record<string, unknown>;
}
