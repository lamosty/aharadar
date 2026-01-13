import crypto from "node:crypto";

export type AggregateSummaryScopeType = "digest" | "inbox" | "range" | "custom";

export interface AggregateSummaryScope {
  type: AggregateSummaryScopeType;
  digestId?: string;
  topicId?: string;
  since?: string; // ISO timestamp
  until?: string; // ISO timestamp
}

export interface AggregateSummary {
  id: string;
  user_id: string;
  scope_type: AggregateSummaryScopeType;
  scope_hash: string;
  digest_id: string | null;
  topic_id: string | null;
  status: "pending" | "complete" | "error" | "skipped";
  summary_json: Record<string, unknown> | null;
  prompt_id: string | null;
  schema_version: string | null;
  provider: string | null;
  model: string | null;
  input_item_count: number | null;
  input_char_count: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_estimate_credits: number | null;
  meta_json: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

// Helper: compute deterministic scope_hash using SHA256
export function computeAggregateSummaryHash(scope: AggregateSummaryScope): string {
  const normalized = JSON.stringify({
    type: scope.type,
    digestId: scope.digestId || null,
    topicId: scope.topicId || null,
    since: scope.since || null,
    until: scope.until || null,
  });
  return crypto.createHash("sha256").update(normalized).digest("hex");
}
