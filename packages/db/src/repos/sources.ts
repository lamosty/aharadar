import type { Queryable } from "../db";

export interface SourceRow {
  id: string;
  user_id: string;
  topic_id: string;
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
        "select id, user_id, topic_id::text as topic_id, type, name, config_json, cursor_json, is_enabled, created_at from sources where user_id = $1 order by created_at asc",
        [userId]
      );
      return res.rows;
    },

    async listEnabledByUser(userId: string): Promise<SourceRow[]> {
      const res = await db.query<SourceRow>(
        "select id, user_id, topic_id::text as topic_id, type, name, config_json, cursor_json, is_enabled, created_at from sources where user_id = $1 and is_enabled = true order by created_at asc",
        [userId]
      );
      return res.rows;
    },

    async listEnabledByUserAndTopic(params: { userId: string; topicId: string }): Promise<SourceRow[]> {
      const res = await db.query<SourceRow>(
        `select id, user_id, topic_id::text as topic_id, type, name, config_json, cursor_json, is_enabled, created_at
         from sources
         where user_id = $1 and topic_id = $2::uuid and is_enabled = true
         order by created_at asc`,
        [params.userId, params.topicId]
      );
      return res.rows;
    },

    async create(params: {
      userId: string;
      topicId: string;
      type: string;
      name: string;
      config?: Record<string, unknown>;
      cursor?: Record<string, unknown>;
      isEnabled?: boolean;
    }): Promise<{ id: string }> {
      const res = await db.query<{ id: string }>(
        `insert into sources (user_id, topic_id, type, name, config_json, cursor_json, is_enabled)
         values ($1, $2::uuid, $3, $4, $5::jsonb, $6::jsonb, $7)
         returning id`,
        [
          params.userId,
          params.topicId,
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

    async updateTopic(params: { sourceId: string; topicId: string }): Promise<void> {
      await db.query("update sources set topic_id = $2::uuid where id = $1", [params.sourceId, params.topicId]);
    },

    async updateCursor(sourceId: string, cursor: Record<string, unknown>): Promise<void> {
      await db.query("update sources set cursor_json = $2::jsonb where id = $1", [
        sourceId,
        JSON.stringify(cursor),
      ]);
    },
  };
}
