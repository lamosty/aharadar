import type { CatchupPack } from "@aharadar/shared";
import type { Queryable } from "../db";

export function createCatchupPacksRepo(db: Queryable) {
  return {
    async upsert(params: {
      userId: string;
      topicId: string;
      scopeType: string;
      scopeHash: string;
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
    }): Promise<CatchupPack> {
      const res = await db.query<CatchupPack>(
        `insert into catchup_packs (
          user_id, topic_id, scope_type, scope_hash, status,
          summary_json, prompt_id, schema_version, provider, model,
          input_item_count, input_char_count, input_tokens, output_tokens,
          cost_estimate_credits, meta_json, error_message
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
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
          params.topicId,
          params.scopeType,
          params.scopeHash,
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

    async getByScope(params: { userId: string; scopeHash: string }): Promise<CatchupPack | null> {
      const res = await db.query<CatchupPack>(
        `select * from catchup_packs where user_id = $1 and scope_hash = $2 limit 1`,
        [params.userId, params.scopeHash],
      );
      return res.rows[0] ?? null;
    },

    async getById(id: string): Promise<CatchupPack | null> {
      const res = await db.query<CatchupPack>(`select * from catchup_packs where id = $1 limit 1`, [
        id,
      ]);
      return res.rows[0] ?? null;
    },

    async listByTopic(params: {
      userId: string;
      topicId: string;
      limit?: number;
      offset?: number;
    }): Promise<CatchupPack[]> {
      const limit = Math.max(1, Math.min(200, Math.floor(params.limit ?? 50)));
      const offset = Math.max(0, Math.floor(params.offset ?? 0));
      const res = await db.query<CatchupPack>(
        `select *
         from catchup_packs
         where user_id = $1 and topic_id = $2
         order by created_at desc
         limit $3 offset $4`,
        [params.userId, params.topicId, limit, offset],
      );
      return res.rows;
    },

    async updateStatus(params: {
      id: string;
      status: string;
      errorMessage?: string | null;
    }): Promise<CatchupPack | null> {
      const res = await db.query<CatchupPack>(
        `update catchup_packs
         set status = $1,
             error_message = $2,
             updated_at = now()
         where id = $3
         returning *`,
        [params.status, params.errorMessage ?? null, params.id],
      );
      return res.rows[0] ?? null;
    },

    async deleteById(params: { userId: string; id: string }): Promise<number> {
      const res = await db.query<{ count: number }>(
        `with deleted as (
           delete from catchup_packs
           where id = $1::uuid and user_id = $2::uuid
           returning 1
         )
         select count(*)::int as count from deleted`,
        [params.id, params.userId],
      );
      return res.rows[0]?.count ?? 0;
    },

    /**
     * Get item IDs from recent completed catch-up packs for novelty deduplication.
     * Extracts item_ids from all tiers (must_read, worth_scanning, headlines) in summary_json.
     */
    async getRecentPackItemIds(params: {
      userId: string;
      topicId: string;
      withinDays: number;
    }): Promise<Set<string>> {
      const res = await db.query<{ item_id: string }>(
        `select distinct items.item_id
         from catchup_packs cp,
         lateral (
           select jsonb_array_elements(
             coalesce(cp.summary_json->'tiers'->'must_read', '[]'::jsonb) ||
             coalesce(cp.summary_json->'tiers'->'worth_scanning', '[]'::jsonb) ||
             coalesce(cp.summary_json->'tiers'->'headlines', '[]'::jsonb)
           )->>'item_id' as item_id
         ) items
         where cp.user_id = $1
           and cp.topic_id = $2
           and cp.status = 'complete'
           and cp.created_at > now() - interval '1 day' * $3
           and items.item_id is not null`,
        [params.userId, params.topicId, params.withinDays],
      );
      return new Set(res.rows.map((row) => row.item_id));
    },
  };
}
