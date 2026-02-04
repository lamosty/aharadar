import type { Queryable } from "../db";

export interface EmbeddingRetentionRunRow {
  id: string;
  user_id: string;
  topic_id: string;
  window_end: string;
  max_age_days: number;
  max_items: number;
  max_tokens: number;
  effective_max_age_days: number;
  cutoff_at: string;
  deleted_by_age: number;
  deleted_by_max_tokens: number;
  deleted_by_max_items: number;
  total_deleted: number;
  created_at: string;
}

export function createEmbeddingRetentionRunsRepo(db: Queryable) {
  return {
    async insert(params: {
      userId: string;
      topicId: string;
      windowEnd: string;
      maxAgeDays: number;
      maxItems: number;
      maxTokens: number;
      effectiveMaxAgeDays: number;
      cutoffIso: string;
      deletedByAge: number;
      deletedByMaxTokens: number;
      deletedByMaxItems: number;
      totalDeleted: number;
    }): Promise<void> {
      await db.query(
        `insert into embedding_retention_runs (
           user_id, topic_id, window_end,
           max_age_days, max_items, max_tokens, effective_max_age_days,
           cutoff_at, deleted_by_age, deleted_by_max_tokens, deleted_by_max_items, total_deleted
         ) values ($1::uuid, $2::uuid, $3::timestamptz, $4, $5, $6, $7, $8::timestamptz, $9, $10, $11, $12)`,
        [
          params.userId,
          params.topicId,
          params.windowEnd,
          Math.max(0, Math.floor(params.maxAgeDays)),
          Math.max(0, Math.floor(params.maxItems)),
          Math.max(0, Math.floor(params.maxTokens)),
          Math.max(0, Math.floor(params.effectiveMaxAgeDays)),
          params.cutoffIso,
          Math.max(0, Math.floor(params.deletedByAge)),
          Math.max(0, Math.floor(params.deletedByMaxTokens)),
          Math.max(0, Math.floor(params.deletedByMaxItems)),
          Math.max(0, Math.floor(params.totalDeleted)),
        ],
      );
    },

    async getLatestForTopic(params: {
      userId: string;
      topicId: string;
    }): Promise<EmbeddingRetentionRunRow | null> {
      const res = await db.query<EmbeddingRetentionRunRow>(
        `select
           id::text as id,
           user_id::text as user_id,
           topic_id::text as topic_id,
           window_end::text as window_end,
           max_age_days,
           max_items,
           max_tokens,
           effective_max_age_days,
           cutoff_at::text as cutoff_at,
           deleted_by_age,
           deleted_by_max_tokens,
           deleted_by_max_items,
           total_deleted,
           created_at::text as created_at
         from embedding_retention_runs
         where user_id = $1::uuid and topic_id = $2::uuid
         order by created_at desc
         limit 1`,
        [params.userId, params.topicId],
      );

      return res.rows[0] ?? null;
    },
  };
}
