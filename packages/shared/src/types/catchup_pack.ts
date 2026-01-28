import crypto from "node:crypto";

export type CatchupPackScopeType = "range";

export type CatchupPackStatus = "pending" | "complete" | "error" | "skipped";

export interface CatchupPackTierItem {
  item_id: string;
  why: string;
  theme: string;
}

export interface CatchupPackTheme {
  title: string;
  summary: string;
  item_ids: string[];
}

export interface CatchupPackOutput {
  schema_version: "catchup_pack_v1";
  prompt_id: "catchup_pack_v1";
  provider: string;
  model: string;
  time_budget_minutes: number;
  tiers: {
    must_read: CatchupPackTierItem[];
    worth_scanning: CatchupPackTierItem[];
    headlines: CatchupPackTierItem[];
  };
  themes: CatchupPackTheme[];
  notes?: string | null;
}

export interface CatchupPack {
  id: string;
  user_id: string;
  topic_id: string;
  scope_type: CatchupPackScopeType;
  scope_hash: string;
  status: CatchupPackStatus;
  summary_json: CatchupPackOutput | null;
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

export interface CatchupPackScope {
  type: CatchupPackScopeType;
  topicId: string;
  since: string;
  until: string;
  timeBudgetMinutes: number;
}

export function computeCatchupPackHash(scope: CatchupPackScope): string {
  const normalized = JSON.stringify({
    type: scope.type,
    topicId: scope.topicId,
    since: scope.since,
    until: scope.until,
    timeBudgetMinutes: scope.timeBudgetMinutes,
  });
  return crypto.createHash("sha256").update(normalized).digest("hex");
}
