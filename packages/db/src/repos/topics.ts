import type { Queryable } from "../db";
import type { ViewingProfile } from "./user_preferences";
import { PROFILE_DECAY_HOURS } from "./user_preferences";

export interface TopicRow {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  viewing_profile: ViewingProfile | null;
  decay_hours: number | null;
  last_checked_at: string | null;
  created_at: string;
}

export interface Topic {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  viewingProfile: ViewingProfile | null;
  decayHours: number | null;
  lastCheckedAt: Date | null;
  createdAt: Date;
}

function rowToTopic(row: TopicRow): Topic {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    description: row.description,
    viewingProfile: row.viewing_profile,
    decayHours: row.decay_hours,
    lastCheckedAt: row.last_checked_at ? new Date(row.last_checked_at) : null,
    createdAt: new Date(row.created_at),
  };
}

export function createTopicsRepo(db: Queryable) {
  return {
    async listByUser(userId: string): Promise<TopicRow[]> {
      const res = await db.query<TopicRow>(
        `SELECT id, user_id, name, description,
                viewing_profile, decay_hours, last_checked_at::text,
                created_at::text AS created_at
         FROM topics
         WHERE user_id = $1
         ORDER BY created_at ASC`,
        [userId]
      );
      return res.rows;
    },

    async getById(topicId: string): Promise<TopicRow | null> {
      const res = await db.query<TopicRow>(
        `SELECT id, user_id, name, description,
                viewing_profile, decay_hours, last_checked_at::text,
                created_at::text AS created_at
         FROM topics
         WHERE id = $1
         LIMIT 1`,
        [topicId]
      );
      return res.rows[0] ?? null;
    },

    async getByName(params: { userId: string; name: string }): Promise<TopicRow | null> {
      const res = await db.query<TopicRow>(
        `SELECT id, user_id, name, description,
                viewing_profile, decay_hours, last_checked_at::text,
                created_at::text AS created_at
         FROM topics
         WHERE user_id = $1 AND name = $2
         LIMIT 1`,
        [params.userId, params.name]
      );
      return res.rows[0] ?? null;
    },

    async create(params: {
      userId: string;
      name: string;
      description?: string | null;
      viewingProfile?: ViewingProfile | null;
      decayHours?: number | null;
    }): Promise<Topic> {
      // If viewingProfile is set but decayHours is not, derive from profile
      let effectiveDecayHours = params.decayHours;
      if (params.viewingProfile && params.viewingProfile !== "custom" && effectiveDecayHours === undefined) {
        effectiveDecayHours = PROFILE_DECAY_HOURS[params.viewingProfile];
      }

      const res = await db.query<TopicRow>(
        `INSERT INTO topics (user_id, name, description, viewing_profile, decay_hours)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, user_id, name, description,
                   viewing_profile, decay_hours, last_checked_at::text,
                   created_at::text AS created_at`,
        [
          params.userId,
          params.name,
          params.description ?? null,
          params.viewingProfile ?? null,
          effectiveDecayHours ?? null,
        ]
      );
      const row = res.rows[0];
      if (!row) throw new Error("topics.create failed: no row returned");
      return rowToTopic(row);
    },

    async getOrCreateDefaultForUser(userId: string): Promise<{ id: string; inserted: boolean }> {
      const res = await db.query<{ id: string; inserted: boolean }>(
        `insert into topics (user_id, name)
         values ($1, 'General')
         on conflict (user_id, name)
         do update set name = excluded.name
         returning id, (xmax = 0) as inserted`,
        [userId]
      );
      const row = res.rows[0];
      if (!row) throw new Error("topics.getOrCreateDefaultForUser failed: no row returned");
      return row;
    },

    /**
     * Get the first topic for a user (by creation date).
     * Returns null if the user has no topics.
     */
    async getFirstByUserId(userId: string): Promise<Topic | null> {
      const res = await db.query<TopicRow>(
        `SELECT id, user_id, name, description,
                viewing_profile, decay_hours, last_checked_at::text,
                created_at::text AS created_at
         FROM topics
         WHERE user_id = $1
         ORDER BY created_at ASC
         LIMIT 1`,
        [userId]
      );
      const row = res.rows[0];
      return row ? rowToTopic(row) : null;
    },

    /**
     * Update viewing profile settings for a topic.
     */
    async updateViewingProfile(
      id: string,
      updates: { viewingProfile?: ViewingProfile; decayHours?: number }
    ): Promise<Topic> {
      const { viewingProfile, decayHours } = updates;

      // Build dynamic update
      const setClauses: string[] = [];
      const values: unknown[] = [];
      let paramIdx = 1;

      if (viewingProfile !== undefined) {
        setClauses.push(`viewing_profile = $${paramIdx}`);
        values.push(viewingProfile);
        paramIdx++;

        // Auto-set decay_hours based on profile (unless custom or decayHours explicitly provided)
        if (viewingProfile !== "custom" && decayHours === undefined) {
          setClauses.push(`decay_hours = $${paramIdx}`);
          values.push(PROFILE_DECAY_HOURS[viewingProfile]);
          paramIdx++;
        }
      }

      if (decayHours !== undefined) {
        setClauses.push(`decay_hours = $${paramIdx}`);
        values.push(Math.max(1, Math.min(720, decayHours)));
        paramIdx++;
      }

      if (setClauses.length === 0) {
        // No updates, just return current
        const current = await this.getById(id);
        if (!current) throw new Error("topics.updateViewingProfile: topic not found");
        return rowToTopic(current);
      }

      values.push(id);

      const res = await db.query<TopicRow>(
        `UPDATE topics
         SET ${setClauses.join(", ")}
         WHERE id = $${paramIdx}
         RETURNING id, user_id, name, description,
                   viewing_profile, decay_hours, last_checked_at::text,
                   created_at::text AS created_at`,
        values
      );

      const row = res.rows[0];
      if (!row) throw new Error("topics.updateViewingProfile: topic not found");
      return rowToTopic(row);
    },

    /**
     * Update last_checked_at to now().
     */
    async touchLastChecked(id: string): Promise<Topic> {
      const res = await db.query<TopicRow>(
        `UPDATE topics
         SET last_checked_at = now()
         WHERE id = $1
         RETURNING id, user_id, name, description,
                   viewing_profile, decay_hours, last_checked_at::text,
                   created_at::text AS created_at`,
        [id]
      );

      const row = res.rows[0];
      if (!row) throw new Error("topics.touchLastChecked: topic not found");
      return rowToTopic(row);
    },

    /**
     * Update topic name and/or description.
     */
    async update(
      id: string,
      updates: { name?: string; description?: string | null }
    ): Promise<Topic> {
      const { name, description } = updates;

      const setClauses: string[] = [];
      const values: unknown[] = [];
      let paramIdx = 1;

      if (name !== undefined) {
        setClauses.push(`name = $${paramIdx}`);
        values.push(name);
        paramIdx++;
      }

      if (description !== undefined) {
        setClauses.push(`description = $${paramIdx}`);
        values.push(description);
        paramIdx++;
      }

      if (setClauses.length === 0) {
        const current = await this.getById(id);
        if (!current) throw new Error("topics.update: topic not found");
        return rowToTopic(current);
      }

      values.push(id);

      const res = await db.query<TopicRow>(
        `UPDATE topics
         SET ${setClauses.join(", ")}
         WHERE id = $${paramIdx}
         RETURNING id, user_id, name, description,
                   viewing_profile, decay_hours, last_checked_at::text,
                   created_at::text AS created_at`,
        values
      );

      const row = res.rows[0];
      if (!row) throw new Error("topics.update: topic not found");
      return rowToTopic(row);
    },

    /**
     * Delete a topic. Returns true if deleted, false if not found.
     * Note: Sources belonging to this topic should be handled by the caller.
     */
    async delete(id: string): Promise<boolean> {
      const res = await db.query("DELETE FROM topics WHERE id = $1", [id]);
      return (res.rowCount ?? 0) > 0;
    },
  };
}
