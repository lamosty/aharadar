import type { Queryable } from "../db";

export type FetchRunStatus = "ok" | "partial" | "error";

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
  };
}
