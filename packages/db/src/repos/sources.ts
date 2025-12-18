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
    async listEnabledByUser(userId: string): Promise<SourceRow[]> {
      const res = await db.query<SourceRow>(
        "select id, user_id, type, name, config_json, cursor_json, is_enabled, created_at from sources where user_id = $1 and is_enabled = true order by created_at asc",
        [userId]
      );
      return res.rows;
    },

    async updateCursor(sourceId: string, cursor: Record<string, unknown>): Promise<void> {
      await db.query("update sources set cursor_json = $2::jsonb where id = $1", [sourceId, JSON.stringify(cursor)]);
    }
  };
}
