import type { Queryable } from "../db";

/**
 * Scoring mode configuration schema.
 * Defines weights and feature flags for ranking.
 */
export interface ScoringModeConfig {
  version: 1;
  weights: {
    wAha: number; // AI triage score weight (default 0.8)
    wHeuristic: number; // Recency + engagement weight (default 0.15)
    wPref: number; // Embedding preference weight (default 0.15)
    wNovelty: number; // Novelty bonus weight (default 0.05)
  };
  features: {
    perSourceCalibration: boolean; // Adjust AI score per source
    aiPreferenceInjection: boolean; // Add prefs to triage prompt
    embeddingPreferences: boolean; // Use embedding similarity
  };
  llm: {
    /** Scale LLM usage relative to the digest plan (0.5-2.0) */
    usageScale: number;
  };
  calibration: {
    windowDays: number; // Rolling window for hit rate
    minSamples: number; // Min feedbacks before calibrating
    maxOffset: number; // Max calibration adjustment (e.g., 0.2 = ±20%)
  };
}

export interface ScoringModeRow {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  config_json: ScoringModeConfig;
  notes: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface ScoringMode {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  config: ScoringModeConfig;
  notes: string | null;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ScoringModeChangeRow {
  id: string;
  user_id: string;
  topic_id: string | null;
  previous_mode_id: string | null;
  new_mode_id: string | null;
  reason: string | null;
  changed_at: string;
}

export interface ScoringModeChange {
  id: string;
  userId: string;
  topicId: string | null;
  previousModeId: string | null;
  newModeId: string | null;
  reason: string | null;
  changedAt: Date;
}

/**
 * Default scoring mode config (matches "Balanced" preset).
 */
export const DEFAULT_SCORING_MODE_CONFIG: ScoringModeConfig = {
  version: 1,
  weights: {
    wAha: 0.8,
    wHeuristic: 0.15,
    wPref: 0.15,
    wNovelty: 0.05,
  },
  features: {
    perSourceCalibration: false,
    aiPreferenceInjection: false,
    embeddingPreferences: true,
  },
  llm: {
    usageScale: 1,
  },
  calibration: {
    windowDays: 30,
    minSamples: 10,
    maxOffset: 0.2,
  },
};

const LLM_USAGE_SCALE_RANGE = { min: 0.5, max: 2.0 };

function clampUsageScale(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(LLM_USAGE_SCALE_RANGE.min, Math.min(LLM_USAGE_SCALE_RANGE.max, value));
}

function rowToScoringMode(row: ScoringModeRow): ScoringMode {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    description: row.description,
    config: normalizeScoringModeConfig(row.config_json),
    notes: row.notes,
    isDefault: row.is_default,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function rowToScoringModeChange(row: ScoringModeChangeRow): ScoringModeChange {
  return {
    id: row.id,
    userId: row.user_id,
    topicId: row.topic_id,
    previousModeId: row.previous_mode_id,
    newModeId: row.new_mode_id,
    reason: row.reason,
    changedAt: new Date(row.changed_at),
  };
}

/**
 * Validate and normalize scoring mode config.
 * Fills in missing fields with defaults.
 */
export function normalizeScoringModeConfig(
  input: Partial<ScoringModeConfig> | unknown,
): ScoringModeConfig {
  const config = (input && typeof input === "object" ? input : {}) as Partial<ScoringModeConfig>;

  return {
    version: 1,
    weights: {
      wAha: config.weights?.wAha ?? DEFAULT_SCORING_MODE_CONFIG.weights.wAha,
      wHeuristic: config.weights?.wHeuristic ?? DEFAULT_SCORING_MODE_CONFIG.weights.wHeuristic,
      wPref: config.weights?.wPref ?? DEFAULT_SCORING_MODE_CONFIG.weights.wPref,
      wNovelty: config.weights?.wNovelty ?? DEFAULT_SCORING_MODE_CONFIG.weights.wNovelty,
    },
    features: {
      perSourceCalibration:
        config.features?.perSourceCalibration ??
        DEFAULT_SCORING_MODE_CONFIG.features.perSourceCalibration,
      aiPreferenceInjection:
        config.features?.aiPreferenceInjection ??
        DEFAULT_SCORING_MODE_CONFIG.features.aiPreferenceInjection,
      embeddingPreferences:
        config.features?.embeddingPreferences ??
        DEFAULT_SCORING_MODE_CONFIG.features.embeddingPreferences,
    },
    llm: {
      usageScale: clampUsageScale(
        config.llm?.usageScale,
        DEFAULT_SCORING_MODE_CONFIG.llm.usageScale,
      ),
    },
    calibration: {
      windowDays:
        config.calibration?.windowDays ?? DEFAULT_SCORING_MODE_CONFIG.calibration.windowDays,
      minSamples:
        config.calibration?.minSamples ?? DEFAULT_SCORING_MODE_CONFIG.calibration.minSamples,
      maxOffset: config.calibration?.maxOffset ?? DEFAULT_SCORING_MODE_CONFIG.calibration.maxOffset,
    },
  };
}

export function createScoringModesRepo(db: Queryable) {
  return {
    /**
     * List all scoring modes for a user.
     */
    async listByUser(userId: string): Promise<ScoringMode[]> {
      const res = await db.query<ScoringModeRow>(
        `SELECT id, user_id, name, description, config_json,
                notes, is_default, created_at::text, updated_at::text
         FROM scoring_modes
         WHERE user_id = $1
         ORDER BY is_default DESC, name ASC`,
        [userId],
      );
      return res.rows.map(rowToScoringMode);
    },

    /**
     * Get a scoring mode by ID.
     */
    async getById(id: string): Promise<ScoringMode | null> {
      const res = await db.query<ScoringModeRow>(
        `SELECT id, user_id, name, description, config_json,
                notes, is_default, created_at::text, updated_at::text
         FROM scoring_modes
         WHERE id = $1
         LIMIT 1`,
        [id],
      );
      const row = res.rows[0];
      return row ? rowToScoringMode(row) : null;
    },

    /**
     * Get the default scoring mode for a user.
     * Returns null if no default is set.
     */
    async getDefaultForUser(userId: string): Promise<ScoringMode | null> {
      const res = await db.query<ScoringModeRow>(
        `SELECT id, user_id, name, description, config_json,
                notes, is_default, created_at::text, updated_at::text
         FROM scoring_modes
         WHERE user_id = $1 AND is_default = TRUE
         LIMIT 1`,
        [userId],
      );
      const row = res.rows[0];
      return row ? rowToScoringMode(row) : null;
    },

    /**
     * Create a new scoring mode.
     */
    async create(params: {
      userId: string;
      name: string;
      description?: string | null;
      config?: Partial<ScoringModeConfig>;
      notes?: string | null;
      isDefault?: boolean;
    }): Promise<ScoringMode> {
      const config = normalizeScoringModeConfig(params.config);
      const isDefault = params.isDefault ?? false;

      // If setting as default, unset other defaults first
      if (isDefault) {
        await db.query(
          `UPDATE scoring_modes SET is_default = FALSE WHERE user_id = $1 AND is_default = TRUE`,
          [params.userId],
        );
      }

      const res = await db.query<ScoringModeRow>(
        `INSERT INTO scoring_modes (user_id, name, description, config_json, notes, is_default)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, user_id, name, description, config_json,
                   notes, is_default, created_at::text, updated_at::text`,
        [
          params.userId,
          params.name,
          params.description ?? null,
          JSON.stringify(config),
          params.notes ?? null,
          isDefault,
        ],
      );

      const row = res.rows[0];
      if (!row) throw new Error("scoring_modes.create failed: no row returned");
      return rowToScoringMode(row);
    },

    /**
     * Update a scoring mode.
     */
    async update(
      id: string,
      updates: {
        name?: string;
        description?: string | null;
        config?: Partial<ScoringModeConfig>;
        notes?: string | null;
      },
    ): Promise<ScoringMode> {
      const setClauses: string[] = ["updated_at = NOW()"];
      const values: unknown[] = [];
      let paramIdx = 1;

      if (updates.name !== undefined) {
        setClauses.push(`name = $${paramIdx}`);
        values.push(updates.name);
        paramIdx++;
      }

      if (updates.description !== undefined) {
        setClauses.push(`description = $${paramIdx}`);
        values.push(updates.description);
        paramIdx++;
      }

      if (updates.config !== undefined) {
        // Merge with existing config rather than replacing
        const currentRes = await db.query<{ config_json: ScoringModeConfig }>(
          `SELECT config_json FROM scoring_modes WHERE id = $1`,
          [id],
        );
        const currentConfig = currentRes.rows[0]?.config_json ?? DEFAULT_SCORING_MODE_CONFIG;
        const mergedConfig = normalizeScoringModeConfig({
          ...currentConfig,
          ...updates.config,
          weights: { ...currentConfig.weights, ...updates.config.weights },
          features: { ...currentConfig.features, ...updates.config.features },
          llm: { ...currentConfig.llm, ...updates.config.llm },
          calibration: { ...currentConfig.calibration, ...updates.config.calibration },
        });
        setClauses.push(`config_json = $${paramIdx}`);
        values.push(JSON.stringify(mergedConfig));
        paramIdx++;
      }

      if (updates.notes !== undefined) {
        setClauses.push(`notes = $${paramIdx}`);
        values.push(updates.notes);
        paramIdx++;
      }

      values.push(id);

      const res = await db.query<ScoringModeRow>(
        `UPDATE scoring_modes
         SET ${setClauses.join(", ")}
         WHERE id = $${paramIdx}
         RETURNING id, user_id, name, description, config_json,
                   notes, is_default, created_at::text, updated_at::text`,
        values,
      );

      const row = res.rows[0];
      if (!row) throw new Error("scoring_modes.update: mode not found");
      return rowToScoringMode(row);
    },

    /**
     * Set a mode as the default for a user.
     * Unsets any previous default.
     */
    async setDefault(userId: string, modeId: string): Promise<void> {
      // Unset existing default
      await db.query(
        `UPDATE scoring_modes SET is_default = FALSE WHERE user_id = $1 AND is_default = TRUE`,
        [userId],
      );

      // Set new default
      await db.query(
        `UPDATE scoring_modes SET is_default = TRUE, updated_at = NOW()
         WHERE id = $1 AND user_id = $2`,
        [modeId, userId],
      );
    },

    /**
     * Delete a scoring mode.
     * Returns true if deleted, false if not found.
     */
    async delete(id: string): Promise<boolean> {
      const res = await db.query(`DELETE FROM scoring_modes WHERE id = $1`, [id]);
      return (res.rowCount ?? 0) > 0;
    },

    /**
     * Log a mode change for audit trail.
     */
    async logChange(params: {
      userId: string;
      topicId?: string | null;
      previousModeId?: string | null;
      newModeId?: string | null;
      reason?: string | null;
    }): Promise<ScoringModeChange> {
      const res = await db.query<ScoringModeChangeRow>(
        `INSERT INTO scoring_mode_changes (user_id, topic_id, previous_mode_id, new_mode_id, reason)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, user_id, topic_id, previous_mode_id, new_mode_id, reason, changed_at::text`,
        [
          params.userId,
          params.topicId ?? null,
          params.previousModeId ?? null,
          params.newModeId ?? null,
          params.reason ?? null,
        ],
      );

      const row = res.rows[0];
      if (!row) throw new Error("scoring_modes.logChange failed: no row returned");
      return rowToScoringModeChange(row);
    },

    /**
     * Get audit log of mode changes.
     */
    async getChanges(params: {
      userId: string;
      topicId?: string | null;
      limit?: number;
    }): Promise<ScoringModeChange[]> {
      const limit = params.limit ?? 50;

      if (params.topicId) {
        const res = await db.query<ScoringModeChangeRow>(
          `SELECT id, user_id, topic_id, previous_mode_id, new_mode_id, reason, changed_at::text
           FROM scoring_mode_changes
           WHERE user_id = $1 AND topic_id = $2
           ORDER BY changed_at DESC
           LIMIT $3`,
          [params.userId, params.topicId, limit],
        );
        return res.rows.map(rowToScoringModeChange);
      }

      const res = await db.query<ScoringModeChangeRow>(
        `SELECT id, user_id, topic_id, previous_mode_id, new_mode_id, reason, changed_at::text
         FROM scoring_mode_changes
         WHERE user_id = $1
         ORDER BY changed_at DESC
         LIMIT $2`,
        [params.userId, limit],
      );
      return res.rows.map(rowToScoringModeChange);
    },
  };
}
