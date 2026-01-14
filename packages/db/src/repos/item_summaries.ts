import type { Queryable } from "../db";

export interface ItemSummaryRow {
  id: string;
  user_id: string;
  content_item_id: string;
  summary_json: unknown;
  source: string;
  created_at: string;
  updated_at: string;
}

export function createItemSummariesRepo(db: Queryable) {
  return {
    /**
     * Upsert a manual item summary.
     * If a summary already exists for this user+item, it will be updated.
     */
    async upsertSummary(params: {
      userId: string;
      contentItemId: string;
      summaryJson: unknown;
      source?: string;
    }): Promise<{ id: string }> {
      const res = await db.query<{ id: string }>(
        `insert into content_item_summaries (user_id, content_item_id, summary_json, source)
         values ($1, $2::uuid, $3::jsonb, $4)
         on conflict (user_id, content_item_id)
         do update set
           summary_json = excluded.summary_json,
           source = excluded.source,
           updated_at = now()
         returning id::text`,
        [params.userId, params.contentItemId, params.summaryJson, params.source ?? "manual_paste"],
      );
      const row = res.rows[0];
      if (!row) throw new Error("Failed to upsert item summary");
      return row;
    },
  };
}
