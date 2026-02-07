import type { Queryable } from "../db";

export interface SourceHealthRow {
  sourceId: string;
  sourceName: string;
  sourceType: string;
  totalItems: number;
  itemsLast24h: number;
  itemsLast7d: number;
  lastFetchedAt: string | null;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  lastRunErrors: number;
  errorsLast24h: number;
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
        last_run_at: string | null;
        last_run_status: string | null;
        last_run_errors: string | null;
        errors_last_24h: string | null;
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
           last_run.ended_at::text as last_run_at,
           last_run.status as last_run_status,
           coalesce((last_run.counts_json->>'errors')::int, 0)::text as last_run_errors,
           coalesce(recent_errors.errors_24h, 0)::text as errors_last_24h,
           s.is_enabled
         from sources s
         left join content_items ci on ci.source_id = s.id and ci.deleted_at is null
         left join lateral (
           select fr.status, fr.ended_at, fr.counts_json
           from fetch_runs fr
           where fr.source_id = s.id
           order by fr.started_at desc
           limit 1
         ) last_run on true
         left join lateral (
           select count(*) filter (where fr.status in ('error','partial')) as errors_24h
           from fetch_runs fr
           where fr.source_id = s.id
             and fr.started_at > now() - interval '24 hours'
         ) recent_errors on true
         where s.user_id = $1
         group by
           s.id,
           s.name,
           s.type,
           s.is_enabled,
           last_run.status,
           last_run.ended_at,
           last_run.counts_json,
           recent_errors.errors_24h
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
        lastRunAt: row.last_run_at,
        lastRunStatus: row.last_run_status,
        lastRunErrors: Number(row.last_run_errors ?? 0),
        errorsLast24h: Number(row.errors_last_24h ?? 0),
        isEnabled: row.is_enabled,
      }));
    },

    async getHandleHealth(params: {
      userId: string;
      sourceId?: string;
    }): Promise<HandleHealthRow[]> {
      const handleExpr = "lower(ltrim(btrim(ci.raw_json->>'user_handle'), '@'))";
      const conditions = ["s.user_id = $1", `${handleExpr} <> ''`];
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
           ${handleExpr} as handle,
           s.id as source_id,
           s.name as source_name,
           count(ci.id) as total_items,
           count(ci.id) filter (where ci.fetched_at > now() - interval '7 days') as items_last_7d,
           max(ci.fetched_at)::text as last_fetched_at,
           max(ci.raw_json->>'date')::text as last_post_date
         from content_items ci
         join sources s on s.id = ci.source_id
         where ${conditions.join(" and ")} and ci.deleted_at is null
         group by ${handleExpr}, s.id, s.name
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

    async normalizeStoredXUserHandles(params: {
      userId: string;
      sourceId?: string;
      dryRun?: boolean;
    }): Promise<{ candidates: number; updated: number }> {
      const handleExpr = "lower(ltrim(btrim(raw_json->>'user_handle'), '@'))";
      const conditions = [
        "user_id = $1",
        "source_type = 'x_posts'",
        "raw_json is not null",
        "raw_json->>'user_handle' is not null",
        `${handleExpr} <> ''`,
        `(raw_json->>'user_handle') IS DISTINCT FROM ${handleExpr}`,
      ];
      const values: unknown[] = [params.userId];

      if (params.sourceId) {
        values.push(params.sourceId);
        conditions.push(`source_id = $${values.length}::uuid`);
      }

      const whereClause = conditions.join(" and ");
      const countRes = await db.query<{ count: string }>(
        `select count(*)::text as count
         from content_items
         where ${whereClause}`,
        values,
      );
      const candidates = Number(countRes.rows[0]?.count ?? "0");

      if (params.dryRun || candidates === 0) {
        return { candidates, updated: 0 };
      }

      const updateRes = await db.query(
        `update content_items
         set raw_json = jsonb_set(
           raw_json,
           '{user_handle}',
           to_jsonb(${handleExpr}),
           true
         )
         where ${whereClause}`,
        values,
      );

      return {
        candidates,
        updated: updateRes.rowCount ?? 0,
      };
    },
  };
}
