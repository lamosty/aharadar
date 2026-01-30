import type { Queryable } from "../db";

export type FetchRunStatus = "ok" | "partial" | "error";

export interface FetchRunWithSource {
  id: string;
  sourceId: string;
  sourceName: string;
  sourceType: string;
  status: FetchRunStatus;
  startedAt: string;
  endedAt: string | null;
  counts: Record<string, unknown>;
  error: Record<string, unknown> | null;
}

export interface ListRecentFetchRunsParams {
  userId: string;
  limit?: number;
  offset?: number;
  sourceId?: string;
  status?: string;
  hoursAgo?: number;
}

export interface FetchRunRow {
  id: string;
  source_id: string;
  started_at: string;
  ended_at: string | null;
  status: FetchRunStatus;
  cursor_in_json: Record<string, unknown>;
  cursor_out_json: Record<string, unknown>;
  counts_json: Record<string, unknown>;
  error_json: Record<string, unknown> | null;
  created_at: string;
}

export function createFetchRunsRepo(db: Queryable) {
  return {
    async start(sourceId: string, cursorIn: Record<string, unknown>): Promise<{ id: string }> {
      const res = await db.query<{ id: string }>(
        "insert into fetch_runs (source_id, status, cursor_in_json, cursor_out_json, counts_json) values ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb) returning id",
        [sourceId, "ok", JSON.stringify(cursorIn), JSON.stringify({}), JSON.stringify({})],
      );
      const row = res.rows[0];
      if (!row) throw new Error("Failed to start fetch_run");
      return row;
    },

    async finish(params: {
      fetchRunId: string;
      status: FetchRunStatus;
      cursorOut: Record<string, unknown>;
      counts: Record<string, unknown>;
      error?: Record<string, unknown>;
    }): Promise<void> {
      await db.query(
        "update fetch_runs set ended_at = now(), status = $2, cursor_out_json = $3::jsonb, counts_json = $4::jsonb, error_json = $5::jsonb where id = $1",
        [
          params.fetchRunId,
          params.status,
          JSON.stringify(params.cursorOut),
          JSON.stringify(params.counts),
          params.error ? JSON.stringify(params.error) : null,
        ],
      );
    },

    async listRecent(params: ListRecentFetchRunsParams): Promise<FetchRunWithSource[]> {
      const limit = params.limit ?? 50;
      const offset = params.offset ?? 0;
      const hoursAgo = params.hoursAgo ?? 48;

      const conditions: string[] = ["s.user_id = $1", "fr.started_at > now() - $2::interval"];
      const values: unknown[] = [params.userId, `${hoursAgo} hours`];
      let paramIndex = 3;

      if (params.sourceId) {
        conditions.push(`fr.source_id = $${paramIndex}`);
        values.push(params.sourceId);
        paramIndex++;
      }

      if (params.status) {
        conditions.push(`fr.status = $${paramIndex}`);
        values.push(params.status);
        paramIndex++;
      }

      values.push(limit, offset);

      const sql = `
        select
          fr.id,
          fr.source_id as "sourceId",
          s.name as "sourceName",
          s.type as "sourceType",
          fr.status,
          fr.started_at as "startedAt",
          fr.ended_at as "endedAt",
          fr.counts_json as "counts",
          fr.error_json as "error"
        from fetch_runs fr
        join sources s on s.id = fr.source_id
        where ${conditions.join(" and ")}
        order by fr.started_at desc
        limit $${paramIndex} offset $${paramIndex + 1}
      `;

      const res = await db.query<FetchRunWithSource>(sql, values);
      return res.rows;
    },
  };
}
