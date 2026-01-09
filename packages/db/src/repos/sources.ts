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
        [userId],
      );
      return res.rows;
    },

    async listEnabledByUser(userId: string): Promise<SourceRow[]> {
      const res = await db.query<SourceRow>(
        "select id, user_id, topic_id::text as topic_id, type, name, config_json, cursor_json, is_enabled, created_at from sources where user_id = $1 and is_enabled = true order by created_at asc",
        [userId],
      );
      return res.rows;
    },

    async listEnabledByUserAndTopic(params: {
      userId: string;
      topicId: string;
    }): Promise<SourceRow[]> {
      const res = await db.query<SourceRow>(
        `select id, user_id, topic_id::text as topic_id, type, name, config_json, cursor_json, is_enabled, created_at
         from sources
         where user_id = $1 and topic_id = $2::uuid and is_enabled = true
         order by created_at asc`,
        [params.userId, params.topicId],
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
        ],
      );
      const row = res.rows[0];
      if (!row) throw new Error("sources.create failed: no row returned");
      return row;
    },

    async updateTopic(params: { sourceId: string; topicId: string }): Promise<void> {
      await db.query("update sources set topic_id = $2::uuid where id = $1", [
        params.sourceId,
        params.topicId,
      ]);
    },

    async updateCursor(sourceId: string, cursor: Record<string, unknown>): Promise<void> {
      await db.query("update sources set cursor_json = $2::jsonb where id = $1", [
        sourceId,
        JSON.stringify(cursor),
      ]);
    },

    async getById(sourceId: string): Promise<SourceRow | null> {
      const res = await db.query<SourceRow>(
        "select id, user_id, topic_id::text as topic_id, type, name, config_json, cursor_json, is_enabled, created_at from sources where id = $1::uuid",
        [sourceId],
      );
      return res.rows[0] ?? null;
    },

    async updateConfigCadence(params: {
      sourceId: string;
      cadence: { mode: "interval"; everyMinutes: number } | null;
    }): Promise<{
      previous: Record<string, unknown> | null;
      updated: Record<string, unknown> | null;
    }> {
      // Get current config first
      const current = await db.query<{ config_json: Record<string, unknown> }>(
        "select config_json from sources where id = $1::uuid",
        [params.sourceId],
      );
      const row = current.rows[0];
      if (!row) throw new Error(`Source not found: ${params.sourceId}`);

      const configJson = row.config_json ?? {};
      const previousCadence =
        configJson.cadence && typeof configJson.cadence === "object"
          ? (configJson.cadence as Record<string, unknown>)
          : null;

      let newConfigJson: Record<string, unknown>;
      let newCadence: Record<string, unknown> | null;

      if (params.cadence === null) {
        // Clear cadence
        const { cadence: _removed, ...rest } = configJson;
        newConfigJson = rest;
        newCadence = null;
      } else {
        // Set cadence
        newCadence = { mode: params.cadence.mode, every_minutes: params.cadence.everyMinutes };
        newConfigJson = { ...configJson, cadence: newCadence };
      }

      await db.query("update sources set config_json = $2::jsonb where id = $1::uuid", [
        params.sourceId,
        JSON.stringify(newConfigJson),
      ]);

      return { previous: previousCadence, updated: newCadence };
    },

    async updateConfigWeight(params: {
      sourceId: string;
      weight: number | null;
    }): Promise<{ previous: number | null; updated: number | null }> {
      // Get current config first
      const current = await db.query<{ config_json: Record<string, unknown> }>(
        "select config_json from sources where id = $1::uuid",
        [params.sourceId],
      );
      const row = current.rows[0];
      if (!row) throw new Error(`Source not found: ${params.sourceId}`);

      const configJson = row.config_json ?? {};
      const previousWeight =
        typeof configJson.weight === "number" && Number.isFinite(configJson.weight)
          ? configJson.weight
          : null;

      let newConfigJson: Record<string, unknown>;
      let newWeight: number | null;

      if (params.weight === null) {
        // Clear weight (revert to default 1.0)
        const { weight: _removed, ...rest } = configJson;
        newConfigJson = rest;
        newWeight = null;
      } else {
        // Set weight (clamp to safe range)
        newWeight = Math.max(0.1, Math.min(3.0, params.weight));
        newConfigJson = { ...configJson, weight: newWeight };
      }

      await db.query("update sources set config_json = $2::jsonb where id = $1::uuid", [
        params.sourceId,
        JSON.stringify(newConfigJson),
      ]);

      return { previous: previousWeight, updated: newWeight };
    },

    async updateEnabled(params: {
      sourceId: string;
      isEnabled: boolean;
    }): Promise<{ previous: boolean; updated: boolean }> {
      const current = await db.query<{ is_enabled: boolean }>(
        "select is_enabled from sources where id = $1::uuid",
        [params.sourceId],
      );
      const row = current.rows[0];
      if (!row) throw new Error(`Source not found: ${params.sourceId}`);

      const previous = row.is_enabled;

      await db.query("update sources set is_enabled = $2 where id = $1::uuid", [
        params.sourceId,
        params.isEnabled,
      ]);

      return { previous, updated: params.isEnabled };
    },

    async updateName(params: {
      sourceId: string;
      name: string;
    }): Promise<{ previous: string; updated: string }> {
      const current = await db.query<{ name: string }>(
        "select name from sources where id = $1::uuid",
        [params.sourceId],
      );
      const row = current.rows[0];
      if (!row) throw new Error(`Source not found: ${params.sourceId}`);

      const previous = row.name;

      await db.query("update sources set name = $2 where id = $1::uuid", [
        params.sourceId,
        params.name,
      ]);

      return { previous, updated: params.name };
    },

    async listByUserAndTopic(params: { userId: string; topicId: string }): Promise<SourceRow[]> {
      const res = await db.query<SourceRow>(
        `select id, user_id, topic_id::text as topic_id, type, name, config_json, cursor_json, is_enabled, created_at
         from sources
         where user_id = $1 and topic_id = $2::uuid
         order by created_at asc`,
        [params.userId, params.topicId],
      );
      return res.rows;
    },

    async delete(params: { sourceId: string; userId: string }): Promise<boolean> {
      // Only delete if the source belongs to the user (security check)
      const res = await db.query(
        "delete from sources where id = $1::uuid and user_id = $2 returning id",
        [params.sourceId, params.userId],
      );
      return res.rowCount !== null && res.rowCount > 0;
    },
  };
}
