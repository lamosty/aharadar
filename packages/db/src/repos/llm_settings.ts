import type { Queryable } from "../db";

export type LlmProvider = "openai" | "anthropic" | "claude-subscription";

export interface LlmSettingsRow {
  id: number;
  provider: LlmProvider;
  anthropic_model: string;
  openai_model: string;
  claude_subscription_enabled: boolean;
  claude_triage_thinking: boolean;
  claude_calls_per_hour: number;
  updated_at: string;
}

export interface LlmSettingsUpdate {
  provider?: LlmProvider;
  anthropic_model?: string;
  openai_model?: string;
  claude_subscription_enabled?: boolean;
  claude_triage_thinking?: boolean;
  claude_calls_per_hour?: number;
}

export function createLlmSettingsRepo(db: Queryable) {
  return {
    async get(): Promise<LlmSettingsRow> {
      const result = await db.query<LlmSettingsRow>(
        `SELECT id, provider, anthropic_model, openai_model,
                claude_subscription_enabled, claude_triage_thinking,
                claude_calls_per_hour, updated_at
         FROM llm_settings
         WHERE id = 1`
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

      if (setClauses.length === 0) {
        // Nothing to update, just return current
        return this.get();
      }

      const result = await db.query<LlmSettingsRow>(
        `UPDATE llm_settings
         SET ${setClauses.join(", ")}
         WHERE id = 1
         RETURNING id, provider, anthropic_model, openai_model,
                   claude_subscription_enabled, claude_triage_thinking,
                   claude_calls_per_hour, updated_at`,
        values
      );

      const row = result.rows[0];
      if (!row) {
        throw new Error("Failed to update LLM settings");
      }
      return row;
    },
  };
}
