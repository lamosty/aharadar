import type { Queryable } from "../db";

export type ExperimentOutcome = "positive" | "neutral" | "negative";

export interface ScoringExperimentRow {
  id: string;
  user_id: string;
  topic_id: string;
  mode_id: string;
  name: string;
  hypothesis: string | null;
  started_at: string;
  ended_at: string | null;
  items_shown: number;
  items_liked: number;
  items_disliked: number;
  items_skipped: number;
  digests_generated: number;
  notes: string | null;
  outcome: string | null;
  learnings: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScoringExperiment {
  id: string;
  userId: string;
  topicId: string;
  modeId: string;
  name: string;
  hypothesis: string | null;
  startedAt: Date;
  endedAt: Date | null;
  itemsShown: number;
  itemsLiked: number;
  itemsDisliked: number;
  itemsSkipped: number;
  digestsGenerated: number;
  notes: string | null;
  outcome: ExperimentOutcome | null;
  learnings: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function rowToExperiment(row: ScoringExperimentRow): ScoringExperiment {
  return {
    id: row.id,
    userId: row.user_id,
    topicId: row.topic_id,
    modeId: row.mode_id,
    name: row.name,
    hypothesis: row.hypothesis,
    startedAt: new Date(row.started_at),
    endedAt: row.ended_at ? new Date(row.ended_at) : null,
    itemsShown: row.items_shown,
    itemsLiked: row.items_liked,
    itemsDisliked: row.items_disliked,
    itemsSkipped: row.items_skipped,
    digestsGenerated: row.digests_generated,
    notes: row.notes,
    outcome: row.outcome as ExperimentOutcome | null,
    learnings: row.learnings,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export function createScoringExperimentsRepo(db: Queryable) {
  return {
    /**
     * List all experiments for a user, optionally filtered by topic.
     */
    async list(params: {
      userId: string;
      topicId?: string;
      activeOnly?: boolean;
      limit?: number;
    }): Promise<ScoringExperiment[]> {
      const conditions = ["user_id = $1"];
      const values: unknown[] = [params.userId];
      let paramIdx = 2;

      if (params.topicId) {
        conditions.push(`topic_id = $${paramIdx}`);
        values.push(params.topicId);
        paramIdx++;
      }

      if (params.activeOnly) {
        conditions.push("ended_at IS NULL");
      }

      const limit = params.limit ?? 100;
      values.push(limit);

      const res = await db.query<ScoringExperimentRow>(
        `SELECT id, user_id, topic_id, mode_id, name, hypothesis,
                started_at::text, ended_at::text,
                items_shown, items_liked, items_disliked, items_skipped, digests_generated,
                notes, outcome, learnings,
                created_at::text, updated_at::text
         FROM scoring_experiments
         WHERE ${conditions.join(" AND ")}
         ORDER BY started_at DESC
         LIMIT $${paramIdx}`,
        values,
      );

      return res.rows.map(rowToExperiment);
    },

    /**
     * Get a single experiment by ID.
     */
    async getById(id: string): Promise<ScoringExperiment | null> {
      const res = await db.query<ScoringExperimentRow>(
        `SELECT id, user_id, topic_id, mode_id, name, hypothesis,
                started_at::text, ended_at::text,
                items_shown, items_liked, items_disliked, items_skipped, digests_generated,
                notes, outcome, learnings,
                created_at::text, updated_at::text
         FROM scoring_experiments
         WHERE id = $1
         LIMIT 1`,
        [id],
      );

      const row = res.rows[0];
      return row ? rowToExperiment(row) : null;
    },

    /**
     * Get the active experiment for a user/topic combination.
     * Returns null if no active experiment exists.
     */
    async getActive(userId: string, topicId: string): Promise<ScoringExperiment | null> {
      const res = await db.query<ScoringExperimentRow>(
        `SELECT id, user_id, topic_id, mode_id, name, hypothesis,
                started_at::text, ended_at::text,
                items_shown, items_liked, items_disliked, items_skipped, digests_generated,
                notes, outcome, learnings,
                created_at::text, updated_at::text
         FROM scoring_experiments
         WHERE user_id = $1 AND topic_id = $2 AND ended_at IS NULL
         ORDER BY started_at DESC
         LIMIT 1`,
        [userId, topicId],
      );

      const row = res.rows[0];
      return row ? rowToExperiment(row) : null;
    },

    /**
     * Get all active experiments for a user (across all topics).
     */
    async getActiveForUser(userId: string): Promise<ScoringExperiment[]> {
      const res = await db.query<ScoringExperimentRow>(
        `SELECT id, user_id, topic_id, mode_id, name, hypothesis,
                started_at::text, ended_at::text,
                items_shown, items_liked, items_disliked, items_skipped, digests_generated,
                notes, outcome, learnings,
                created_at::text, updated_at::text
         FROM scoring_experiments
         WHERE user_id = $1 AND ended_at IS NULL
         ORDER BY started_at DESC`,
        [userId],
      );

      return res.rows.map(rowToExperiment);
    },

    /**
     * Create a new experiment.
     * Automatically ends any existing active experiment for the same topic.
     */
    async create(params: {
      userId: string;
      topicId: string;
      modeId: string;
      name: string;
      hypothesis?: string | null;
    }): Promise<ScoringExperiment> {
      // End any existing active experiment for this topic
      await db.query(
        `UPDATE scoring_experiments
         SET ended_at = NOW(), updated_at = NOW()
         WHERE user_id = $1 AND topic_id = $2 AND ended_at IS NULL`,
        [params.userId, params.topicId],
      );

      const res = await db.query<ScoringExperimentRow>(
        `INSERT INTO scoring_experiments (user_id, topic_id, mode_id, name, hypothesis)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, user_id, topic_id, mode_id, name, hypothesis,
                   started_at::text, ended_at::text,
                   items_shown, items_liked, items_disliked, items_skipped, digests_generated,
                   notes, outcome, learnings,
                   created_at::text, updated_at::text`,
        [params.userId, params.topicId, params.modeId, params.name, params.hypothesis ?? null],
      );

      const row = res.rows[0];
      if (!row) throw new Error("scoring_experiments.create failed: no row returned");
      return rowToExperiment(row);
    },

    /**
     * Update experiment metadata (notes, hypothesis, name).
     */
    async update(
      id: string,
      updates: {
        name?: string;
        hypothesis?: string | null;
        notes?: string | null;
      },
    ): Promise<ScoringExperiment> {
      const setClauses: string[] = ["updated_at = NOW()"];
      const values: unknown[] = [];
      let paramIdx = 1;

      if (updates.name !== undefined) {
        setClauses.push(`name = $${paramIdx}`);
        values.push(updates.name);
        paramIdx++;
      }

      if (updates.hypothesis !== undefined) {
        setClauses.push(`hypothesis = $${paramIdx}`);
        values.push(updates.hypothesis);
        paramIdx++;
      }

      if (updates.notes !== undefined) {
        setClauses.push(`notes = $${paramIdx}`);
        values.push(updates.notes);
        paramIdx++;
      }

      values.push(id);

      const res = await db.query<ScoringExperimentRow>(
        `UPDATE scoring_experiments
         SET ${setClauses.join(", ")}
         WHERE id = $${paramIdx}
         RETURNING id, user_id, topic_id, mode_id, name, hypothesis,
                   started_at::text, ended_at::text,
                   items_shown, items_liked, items_disliked, items_skipped, digests_generated,
                   notes, outcome, learnings,
                   created_at::text, updated_at::text`,
        values,
      );

      const row = res.rows[0];
      if (!row) throw new Error("scoring_experiments.update: experiment not found");
      return rowToExperiment(row);
    },

    /**
     * End an experiment with outcome and learnings.
     */
    async end(
      id: string,
      params: {
        outcome?: ExperimentOutcome | null;
        learnings?: string | null;
      },
    ): Promise<ScoringExperiment> {
      const res = await db.query<ScoringExperimentRow>(
        `UPDATE scoring_experiments
         SET ended_at = NOW(),
             outcome = $2,
             learnings = $3,
             updated_at = NOW()
         WHERE id = $1
         RETURNING id, user_id, topic_id, mode_id, name, hypothesis,
                   started_at::text, ended_at::text,
                   items_shown, items_liked, items_disliked, items_skipped, digests_generated,
                   notes, outcome, learnings,
                   created_at::text, updated_at::text`,
        [id, params.outcome ?? null, params.learnings ?? null],
      );

      const row = res.rows[0];
      if (!row) throw new Error("scoring_experiments.end: experiment not found");
      return rowToExperiment(row);
    },

    /**
     * Increment metrics for an active experiment.
     * Called during digest generation and feedback processing.
     */
    async incrementMetrics(
      id: string,
      metrics: {
        itemsShown?: number;
        itemsLiked?: number;
        itemsDisliked?: number;
        itemsSkipped?: number;
        digestsGenerated?: number;
      },
    ): Promise<void> {
      const updates: string[] = ["updated_at = NOW()"];

      if (metrics.itemsShown) {
        updates.push(`items_shown = items_shown + ${metrics.itemsShown}`);
      }
      if (metrics.itemsLiked) {
        updates.push(`items_liked = items_liked + ${metrics.itemsLiked}`);
      }
      if (metrics.itemsDisliked) {
        updates.push(`items_disliked = items_disliked + ${metrics.itemsDisliked}`);
      }
      if (metrics.itemsSkipped) {
        updates.push(`items_skipped = items_skipped + ${metrics.itemsSkipped}`);
      }
      if (metrics.digestsGenerated) {
        updates.push(`digests_generated = digests_generated + ${metrics.digestsGenerated}`);
      }

      if (updates.length > 1) {
        await db.query(`UPDATE scoring_experiments SET ${updates.join(", ")} WHERE id = $1`, [id]);
      }
    },

    /**
     * Delete an experiment.
     */
    async delete(id: string): Promise<boolean> {
      const res = await db.query(`DELETE FROM scoring_experiments WHERE id = $1`, [id]);
      return (res.rowCount ?? 0) > 0;
    },
  };
}
