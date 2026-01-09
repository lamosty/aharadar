import type { Queryable } from "../db";

export function createContentItemSourcesRepo(db: Queryable) {
  return {
    async upsert(params: {
      contentItemId: string;
      sourceId: string;
    }): Promise<{ inserted: boolean }> {
      const res = await db.query<{ inserted: boolean }>(
        `insert into content_item_sources (content_item_id, source_id)
         values ($1::uuid, $2::uuid)
         on conflict (content_item_id, source_id)
         do update set content_item_id = excluded.content_item_id
         returning (xmax = 0) as inserted`,
        [params.contentItemId, params.sourceId],
      );
      const row = res.rows[0];
      if (!row) throw new Error("content_item_sources.upsert failed: no row returned");
      return row;
    },
  };
}
