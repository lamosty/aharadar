import type { Queryable } from "../db";

export interface SourceHealthRow {
  sourceId: string;
  sourceName: string;
  sourceType: string;
  totalItems: number;
  itemsLast24h: number;
  itemsLast7d: number;
  lastFetchedAt: string | null;
  isEnabled: boolean;
}

export interface HandleHealthRow {
  handle: string;
  sourceId: string;
  sourceName: string;
  totalItems: number;
  itemsLast7d: number;
  lastFetchedAt: string | null;
  lastPostDate: string | null;
}

export function createIngestionHealthRepo(db: Queryable) {
  return {
    async getSourceHealth(params: { userId: string }): Promise<SourceHealthRow[]> {
      const res = await db.query<{
        source_id: string;
        source_name: string;
        source_type: string;
        total_items: string;
        items_last_24h: string;
        items_last_7d: string;
        last_fetched_at: string | null;
        is_enabled: boolean;
      }>(
        `select
           s.id as source_id,
           s.name as source_name,
           s.type as source_type,
           count(ci.id) as total_items,
           count(ci.id) filter (where ci.fetched_at > now() - interval '24 hours') as items_last_24h,
           count(ci.id) filter (where ci.fetched_at > now() - interval '7 days') as items_last_7d,
           max(ci.fetched_at)::text as last_fetched_at,
           s.is_enabled
         from sources s
         left join content_items ci on ci.source_id = s.id and ci.deleted_at is null
         where s.user_id = $1
         group by s.id, s.name, s.type, s.is_enabled
         order by max(ci.fetched_at) desc nulls last`,
        [params.userId],
      );

      return res.rows.map((row) => ({
        sourceId: row.source_id,
        sourceName: row.source_name,
        sourceType: row.source_type,
        totalItems: Number(row.total_items),
        itemsLast24h: Number(row.items_last_24h),
        itemsLast7d: Number(row.items_last_7d),
        lastFetchedAt: row.last_fetched_at,
        isEnabled: row.is_enabled,
      }));
    },

    async getHandleHealth(params: {
      userId: string;
      sourceId?: string;
    }): Promise<HandleHealthRow[]> {
      const conditions = ["s.user_id = $1", "ci.raw_json->>'user_handle' is not null"];
      const values: unknown[] = [params.userId];

      if (params.sourceId) {
        values.push(params.sourceId);
        conditions.push(`s.id = $${values.length}::uuid`);
      }

      const res = await db.query<{
        handle: string;
        source_id: string;
        source_name: string;
        total_items: string;
        items_last_7d: string;
        last_fetched_at: string | null;
        last_post_date: string | null;
      }>(
        `select
           ci.raw_json->>'user_handle' as handle,
           s.id as source_id,
           s.name as source_name,
           count(ci.id) as total_items,
           count(ci.id) filter (where ci.fetched_at > now() - interval '7 days') as items_last_7d,
           max(ci.fetched_at)::text as last_fetched_at,
           max(ci.raw_json->>'date')::text as last_post_date
         from content_items ci
         join sources s on s.id = ci.source_id
         where ${conditions.join(" and ")} and ci.deleted_at is null
         group by ci.raw_json->>'user_handle', s.id, s.name
         order by max(ci.fetched_at) desc nulls last`,
        values,
      );

      return res.rows.map((row) => ({
        handle: row.handle,
        sourceId: row.source_id,
        sourceName: row.source_name,
        totalItems: Number(row.total_items),
        itemsLast7d: Number(row.items_last_7d),
        lastFetchedAt: row.last_fetched_at,
        lastPostDate: row.last_post_date,
      }));
    },
  };
}
