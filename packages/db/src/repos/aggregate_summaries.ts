import type { AggregateSummary } from "@aharadar/shared";
import type { Queryable } from "../db";

export function createAggregateSummariesRepo(db: Queryable) {
  return {
    async upsert(params: {
      userId: string;
      scopeType: string;
      scopeHash: string;
      digestId?: string;
      topicId?: string;
      status: string;
      summaryJson?: Record<string, unknown> | null;
      promptId?: string | null;
      schemaVersion?: string | null;
      provider?: string | null;
      model?: string | null;
      inputItemCount?: number | null;
      inputCharCount?: number | null;
      inputTokens?: number | null;
      outputTokens?: number | null;
      costEstimateCredits?: number | null;
      metaJson?: Record<string, unknown> | null;
      errorMessage?: string | null;
    }): Promise<AggregateSummary> {
      const res = await db.query<AggregateSummary>(
        `insert into aggregate_summaries (
          user_id, scope_type, scope_hash, digest_id, topic_id, status,
          summary_json, prompt_id, schema_version, provider, model,
          input_item_count, input_char_count, input_tokens, output_tokens,
          cost_estimate_credits, meta_json, error_message
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
        on conflict (user_id, scope_hash)
        do update set
          status = excluded.status,
          summary_json = excluded.summary_json,
          prompt_id = excluded.prompt_id,
          schema_version = excluded.schema_version,
          provider = excluded.provider,
          model = excluded.model,
          input_item_count = excluded.input_item_count,
          input_char_count = excluded.input_char_count,
          input_tokens = excluded.input_tokens,
          output_tokens = excluded.output_tokens,
          cost_estimate_credits = excluded.cost_estimate_credits,
          meta_json = excluded.meta_json,
          error_message = excluded.error_message,
          updated_at = now()
        returning *`,
        [
          params.userId,
          params.scopeType,
          params.scopeHash,
          params.digestId || null,
          params.topicId || null,
          params.status,
          params.summaryJson || null,
          params.promptId || null,
          params.schemaVersion || null,
          params.provider || null,
          params.model || null,
          params.inputItemCount || null,
          params.inputCharCount || null,
          params.inputTokens || null,
          params.outputTokens || null,
          params.costEstimateCredits || null,
          params.metaJson || null,
          params.errorMessage || null,
        ],
      );
      return res.rows[0]!;
    },

    async getByHash(params: {
      userId: string;
      scopeHash: string;
    }): Promise<AggregateSummary | null> {
      const res = await db.query<AggregateSummary>(
        `select * from aggregate_summaries where user_id = $1 and scope_hash = $2 limit 1`,
        [params.userId, params.scopeHash],
      );
      return res.rows[0] ?? null;
    },

    async getById(id: string): Promise<AggregateSummary | null> {
      const res = await db.query<AggregateSummary>(
        `select * from aggregate_summaries where id = $1 limit 1`,
        [id],
      );
      return res.rows[0] ?? null;
    },
  };
}
