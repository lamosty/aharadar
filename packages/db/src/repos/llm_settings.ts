import type { Queryable } from "../db";

export type LlmProvider = "openai" | "anthropic" | "claude-subscription" | "codex-subscription";

export type ReasoningEffort = "none" | "low" | "medium" | "high";

export interface LlmSettingsRow {
  id: number;
  provider: LlmProvider;
  anthropic_model: string;
  openai_model: string;
  deep_summary_enabled: boolean;
  claude_subscription_enabled: boolean;
  claude_triage_thinking: boolean;
  claude_calls_per_hour: number;
  codex_subscription_enabled: boolean;
  codex_calls_per_hour: number;
  reasoning_effort: ReasoningEffort;
  triage_batch_enabled: boolean;
  triage_batch_size: number;
  updated_at: string;
}

export interface LlmSettingsUpdate {
  provider?: LlmProvider;
  anthropic_model?: string;
  openai_model?: string;
  deep_summary_enabled?: boolean;
  claude_subscription_enabled?: boolean;
  claude_triage_thinking?: boolean;
  claude_calls_per_hour?: number;
  codex_subscription_enabled?: boolean;
  codex_calls_per_hour?: number;
  reasoning_effort?: ReasoningEffort;
  triage_batch_enabled?: boolean;
  triage_batch_size?: number;
}

export function createLlmSettingsRepo(db: Queryable) {
  return {
    async get(): Promise<LlmSettingsRow> {
      const result = await db.query<LlmSettingsRow>(
        `SELECT id, provider, anthropic_model, openai_model,
                deep_summary_enabled,
                claude_subscription_enabled, claude_triage_thinking,
                claude_calls_per_hour, codex_subscription_enabled,
                codex_calls_per_hour, reasoning_effort,
                triage_batch_enabled, triage_batch_size, updated_at
         FROM llm_settings
         WHERE id = 1`,
      );
      const row = result.rows[0];
      if (!row) {
        // Should not happen due to migration, but handle gracefully
        throw new Error("LLM settings not found - run migrations");
      }
      return row;
    },

    async update(params: LlmSettingsUpdate): Promise<LlmSettingsRow> {
      const setClauses: string[] = [];
      const values: unknown[] = [];
      let paramIndex = 1;

      if (params.provider !== undefined) {
        setClauses.push(`provider = $${paramIndex++}`);
        values.push(params.provider);
      }
      if (params.anthropic_model !== undefined) {
        setClauses.push(`anthropic_model = $${paramIndex++}`);
        values.push(params.anthropic_model);
      }
      if (params.openai_model !== undefined) {
        setClauses.push(`openai_model = $${paramIndex++}`);
        values.push(params.openai_model);
      }
      if (params.deep_summary_enabled !== undefined) {
        setClauses.push(`deep_summary_enabled = $${paramIndex++}`);
        values.push(params.deep_summary_enabled);
      }
      if (params.claude_subscription_enabled !== undefined) {
        setClauses.push(`claude_subscription_enabled = $${paramIndex++}`);
        values.push(params.claude_subscription_enabled);
      }
      if (params.claude_triage_thinking !== undefined) {
        setClauses.push(`claude_triage_thinking = $${paramIndex++}`);
        values.push(params.claude_triage_thinking);
      }
      if (params.claude_calls_per_hour !== undefined) {
        setClauses.push(`claude_calls_per_hour = $${paramIndex++}`);
        values.push(params.claude_calls_per_hour);
      }
      if (params.codex_subscription_enabled !== undefined) {
        setClauses.push(`codex_subscription_enabled = $${paramIndex++}`);
        values.push(params.codex_subscription_enabled);
      }
      if (params.codex_calls_per_hour !== undefined) {
        setClauses.push(`codex_calls_per_hour = $${paramIndex++}`);
        values.push(params.codex_calls_per_hour);
      }
      if (params.reasoning_effort !== undefined) {
        setClauses.push(`reasoning_effort = $${paramIndex++}`);
        values.push(params.reasoning_effort);
      }
      if (params.triage_batch_enabled !== undefined) {
        setClauses.push(`triage_batch_enabled = $${paramIndex++}`);
        values.push(params.triage_batch_enabled);
      }
      if (params.triage_batch_size !== undefined) {
        setClauses.push(`triage_batch_size = $${paramIndex++}`);
        values.push(params.triage_batch_size);
      }

      if (setClauses.length === 0) {
        // Nothing to update, just return current
        return this.get();
      }

      const result = await db.query<LlmSettingsRow>(
        `UPDATE llm_settings
         SET ${setClauses.join(", ")}, updated_at = now()
         WHERE id = 1
         RETURNING id, provider, anthropic_model, openai_model,
                   deep_summary_enabled,
                   claude_subscription_enabled, claude_triage_thinking,
                   claude_calls_per_hour, codex_subscription_enabled,
                   codex_calls_per_hour, reasoning_effort,
                   triage_batch_enabled, triage_batch_size, updated_at`,
        values,
      );

      const row = result.rows[0];
      if (!row) {
        throw new Error("Failed to update LLM settings");
      }
      return row;
    },
  };
}
