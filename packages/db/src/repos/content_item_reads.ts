import type { Queryable } from "../db";

export interface ContentItemReadRow {
  id: string;
  user_id: string;
  content_item_id: string;
  pack_id: string | null;
  read_at: string;
  created_at: string;
}

export function createContentItemReadsRepo(db: Queryable) {
  return {
    async markRead(params: {
      userId: string;
      contentItemId: string;
      packId?: string | null;
      readAt?: string;
    }): Promise<ContentItemReadRow> {
      const res = await db.query<ContentItemReadRow>(
        `insert into content_item_reads (user_id, content_item_id, pack_id, read_at)
         values ($1, $2::uuid, $3::uuid, $4::timestamptz)
         on conflict (user_id, content_item_id)
         do update set
           read_at = excluded.read_at,
           pack_id = excluded.pack_id
         returning
           id,
           user_id::text as user_id,
           content_item_id::text as content_item_id,
           pack_id::text as pack_id,
           read_at::text as read_at,
           created_at::text as created_at`,
        [
          params.userId,
          params.contentItemId,
          params.packId ?? null,
          params.readAt ?? new Date().toISOString(),
        ],
      );
      const row = res.rows[0];
      if (!row) throw new Error("Failed to upsert content_item_read");
      return row;
    },

    async deleteByContentItem(params: { userId: string; contentItemId: string }): Promise<number> {
      const res = await db.query<{ count: number }>(
        `with deleted as (
           delete from content_item_reads
           where user_id = $1 and content_item_id = $2::uuid
           returning 1
         )
         select count(*)::int as count from deleted`,
        [params.userId, params.contentItemId],
      );
      return res.rows[0]?.count ?? 0;
    },

    async getByItemIds(params: {
      userId: string;
      contentItemIds: string[];
    }): Promise<ContentItemReadRow[]> {
      if (params.contentItemIds.length === 0) return [];
      const res = await db.query<ContentItemReadRow>(
        `select
           id,
           user_id::text as user_id,
           content_item_id::text as content_item_id,
           pack_id::text as pack_id,
           read_at::text as read_at,
           created_at::text as created_at
         from content_item_reads
         where user_id = $1 and content_item_id = any($2::uuid[])`,
        [params.userId, params.contentItemIds],
      );
      return res.rows;
    },
  };
}
