import type { Queryable } from "../db";

export interface SourceRow {
  id: string;
  user_id: string;
  type: string;
  name: string;
  config_json: Record<string, unknown>;
  cursor_json: Record<string, unknown>;
  is_enabled: boolean;
  created_at: string;
}

export function createSourcesRepo(db: Queryable) {
  return {
    async listByUser(userId: string): Promise<SourceRow[]> {
      const res = await db.query<SourceRow>(
        "select id, user_id, type, name, config_json, cursor_json, is_enabled, created_at from sources where user_id = $1 order by created_at asc",
        [userId]
      );
      return res.rows;
    },

    async listEnabledByUser(userId: string): Promise<SourceRow[]> {
      const res = await db.query<SourceRow>(
        "select id, user_id, type, name, config_json, cursor_json, is_enabled, created_at from sources where user_id = $1 and is_enabled = true order by created_at asc",
        [userId]
      );
      return res.rows;
    },

    async create(params: {
      userId: string;
      type: string;
      name: string;
      config?: Record<string, unknown>;
      cursor?: Record<string, unknown>;
      isEnabled?: boolean;
    }): Promise<{ id: string }> {
      const res = await db.query<{ id: string }>(
        `insert into sources (user_id, type, name, config_json, cursor_json, is_enabled)
         values ($1, $2, $3, $4::jsonb, $5::jsonb, $6)
         returning id`,
        [
          params.userId,
          params.type,
          params.name,
          JSON.stringify(params.config ?? {}),
          JSON.stringify(params.cursor ?? {}),
          params.isEnabled ?? true,
        ]
      );
      const row = res.rows[0];
      if (!row) throw new Error("sources.create failed: no row returned");
      return row;
    },

    async updateCursor(sourceId: string, cursor: Record<string, unknown>): Promise<void> {
      await db.query("update sources set cursor_json = $2::jsonb where id = $1", [
        sourceId,
        JSON.stringify(cursor),
      ]);
    },
  };
}
