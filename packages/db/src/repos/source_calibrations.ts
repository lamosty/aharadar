import type { Queryable } from "../db";

export interface SourceCalibrationRow {
  user_id: string;
  source_id: string;
  items_shown: number;
  items_liked: number;
  items_disliked: number;
  rolling_hit_rate: number | null;
  calibration_offset: number;
  window_start: string | null;
  updated_at: string;
}

export interface SourceCalibration {
  userId: string;
  sourceId: string;
  itemsShown: number;
  itemsLiked: number;
  itemsDisliked: number;
  rollingHitRate: number | null;
  calibrationOffset: number;
  windowStart: Date | null;
  updatedAt: Date;
}

function rowToSourceCalibration(row: SourceCalibrationRow): SourceCalibration {
  return {
    userId: row.user_id,
    sourceId: row.source_id,
    itemsShown: row.items_shown,
    itemsLiked: row.items_liked,
    itemsDisliked: row.items_disliked,
    rollingHitRate: row.rolling_hit_rate,
    calibrationOffset: row.calibration_offset,
    windowStart: row.window_start ? new Date(row.window_start) : null,
    updatedAt: new Date(row.updated_at),
  };
}

/**
 * Compute calibration offset based on hit rate.
 *
 * @param hitRate - likes / (likes + dislikes), range [0, 1]
 * @param expectedRate - baseline expected hit rate (default 0.5)
 * @param maxOffset - maximum adjustment (default 0.2)
 * @returns calibration offset to apply to AI score
 *
 * Logic:
 * - If hitRate > expectedRate: source performs better than expected, boost score
 * - If hitRate < expectedRate: source performs worse than expected, reduce score
 * - Offset is linear interpolation scaled by maxOffset
 *
 * Example with maxOffset=0.2:
 * - hitRate=0.8, expected=0.5 -> offset = +0.12 (boost)
 * - hitRate=0.3, expected=0.5 -> offset = -0.08 (reduce)
 * - hitRate=0.5, expected=0.5 -> offset = 0 (neutral)
 */
function computeCalibrationOffset(
  hitRate: number,
  expectedRate: number = 0.5,
  maxOffset: number = 0.2,
): number {
  // Scale the difference to [-maxOffset, +maxOffset]
  // When hitRate = 1.0 and expected = 0.5, offset = maxOffset * 1.0 = maxOffset
  // When hitRate = 0.0 and expected = 0.5, offset = maxOffset * -1.0 = -maxOffset
  const delta = hitRate - expectedRate;
  const scaleFactor = 2; // Full range when delta = ±0.5
  return Math.max(-maxOffset, Math.min(maxOffset, delta * scaleFactor * maxOffset));
}

export function createSourceCalibrationsRepo(db: Queryable) {
  return {
    /**
     * Get calibration for a specific user/source pair.
     */
    async get(userId: string, sourceId: string): Promise<SourceCalibration | null> {
      const res = await db.query<SourceCalibrationRow>(
        `SELECT user_id, source_id, items_shown, items_liked, items_disliked,
                rolling_hit_rate, calibration_offset, window_start::text, updated_at::text
         FROM source_calibrations
         WHERE user_id = $1 AND source_id = $2
         LIMIT 1`,
        [userId, sourceId],
      );
      const row = res.rows[0];
      return row ? rowToSourceCalibration(row) : null;
    },

    /**
     * Get or create calibration for a user/source pair.
     */
    async getOrCreate(userId: string, sourceId: string): Promise<SourceCalibration> {
      const res = await db.query<SourceCalibrationRow>(
        `INSERT INTO source_calibrations (user_id, source_id)
         VALUES ($1, $2)
         ON CONFLICT (user_id, source_id) DO UPDATE SET updated_at = source_calibrations.updated_at
         RETURNING user_id, source_id, items_shown, items_liked, items_disliked,
                   rolling_hit_rate, calibration_offset, window_start::text, updated_at::text`,
        [userId, sourceId],
      );
      const row = res.rows[0];
      if (!row) throw new Error("source_calibrations.getOrCreate failed");
      return rowToSourceCalibration(row);
    },

    /**
     * Get all calibrations for a user.
     */
    async listByUser(userId: string): Promise<SourceCalibration[]> {
      const res = await db.query<SourceCalibrationRow>(
        `SELECT user_id, source_id, items_shown, items_liked, items_disliked,
                rolling_hit_rate, calibration_offset, window_start::text, updated_at::text
         FROM source_calibrations
         WHERE user_id = $1
         ORDER BY updated_at DESC`,
        [userId],
      );
      return res.rows.map(rowToSourceCalibration);
    },

    /**
     * Get calibrations for multiple sources (for batch ranking).
     */
    async getBatch(userId: string, sourceIds: string[]): Promise<Map<string, SourceCalibration>> {
      if (sourceIds.length === 0) return new Map();

      const res = await db.query<SourceCalibrationRow>(
        `SELECT user_id, source_id, items_shown, items_liked, items_disliked,
                rolling_hit_rate, calibration_offset, window_start::text, updated_at::text
         FROM source_calibrations
         WHERE user_id = $1 AND source_id = ANY($2)`,
        [userId, sourceIds],
      );

      const map = new Map<string, SourceCalibration>();
      for (const row of res.rows) {
        map.set(row.source_id, rowToSourceCalibration(row));
      }
      return map;
    },

    /**
     * Update calibration stats when an item is shown.
     * Called during digest generation or when items are displayed.
     */
    async recordItemShown(userId: string, sourceId: string): Promise<void> {
      await db.query(
        `INSERT INTO source_calibrations (user_id, source_id, items_shown)
         VALUES ($1, $2, 1)
         ON CONFLICT (user_id, source_id) DO UPDATE SET
           items_shown = source_calibrations.items_shown + 1,
           updated_at = NOW()`,
        [userId, sourceId],
      );
    },

    /**
     * Update calibration on feedback event.
     * Recalculates rolling hit rate and calibration offset.
     *
     * @param action - 'like' or 'dislike'
     * @param minSamples - Minimum feedback count before computing offset
     * @param maxOffset - Maximum calibration offset
     * @param windowDays - Rolling window for statistics (currently resets if window_start is too old)
     */
    async updateOnFeedback(params: {
      userId: string;
      sourceId: string;
      action: "like" | "dislike";
      minSamples?: number;
      maxOffset?: number;
      windowDays?: number;
    }): Promise<SourceCalibration> {
      const minSamples = params.minSamples ?? 10;
      const maxOffset = params.maxOffset ?? 0.2;
      const windowDays = params.windowDays ?? 30;

      const isLike = params.action === "like";

      // First, handle window reset if needed and update counts
      const res = await db.query<SourceCalibrationRow>(
        `INSERT INTO source_calibrations (user_id, source_id, items_liked, items_disliked, window_start)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (user_id, source_id) DO UPDATE SET
           -- Reset counts if window is stale
           items_liked = CASE
             WHEN source_calibrations.window_start IS NULL
                  OR source_calibrations.window_start < NOW() - ($5 || ' days')::interval
             THEN $3
             ELSE source_calibrations.items_liked + $3
           END,
           items_disliked = CASE
             WHEN source_calibrations.window_start IS NULL
                  OR source_calibrations.window_start < NOW() - ($5 || ' days')::interval
             THEN $4
             ELSE source_calibrations.items_disliked + $4
           END,
           window_start = CASE
             WHEN source_calibrations.window_start IS NULL
                  OR source_calibrations.window_start < NOW() - ($5 || ' days')::interval
             THEN NOW()
             ELSE source_calibrations.window_start
           END,
           updated_at = NOW()
         RETURNING user_id, source_id, items_shown, items_liked, items_disliked,
                   rolling_hit_rate, calibration_offset, window_start::text, updated_at::text`,
        [params.userId, params.sourceId, isLike ? 1 : 0, isLike ? 0 : 1, windowDays],
      );

      const row = res.rows[0];
      if (!row) throw new Error("source_calibrations.updateOnFeedback failed");

      // Now compute hit rate and offset if we have enough samples
      const totalFeedback = row.items_liked + row.items_disliked;
      if (totalFeedback >= minSamples) {
        const hitRate = row.items_liked / totalFeedback;
        const offset = computeCalibrationOffset(hitRate, 0.5, maxOffset);

        await db.query(
          `UPDATE source_calibrations
           SET rolling_hit_rate = $3, calibration_offset = $4, updated_at = NOW()
           WHERE user_id = $1 AND source_id = $2`,
          [params.userId, params.sourceId, hitRate, offset],
        );

        return {
          ...rowToSourceCalibration(row),
          rollingHitRate: hitRate,
          calibrationOffset: offset,
        };
      }

      return rowToSourceCalibration(row);
    },

    /**
     * Apply calibration offset to an AI score.
     * Returns adjusted score clamped to [0, 1].
     */
    applyCalibration(params: {
      aiScore: number;
      calibration: SourceCalibration | null;
      minSamples: number;
    }): number {
      if (!params.calibration) return params.aiScore;

      const totalFeedback = params.calibration.itemsLiked + params.calibration.itemsDisliked;
      if (totalFeedback < params.minSamples) return params.aiScore;

      const adjusted = params.aiScore + params.calibration.calibrationOffset;
      return Math.max(0, Math.min(1, adjusted));
    },

    /**
     * Reset calibration for a user/source pair.
     */
    async reset(userId: string, sourceId: string): Promise<void> {
      await db.query(
        `UPDATE source_calibrations
         SET items_shown = 0, items_liked = 0, items_disliked = 0,
             rolling_hit_rate = NULL, calibration_offset = 0,
             window_start = NULL, updated_at = NOW()
         WHERE user_id = $1 AND source_id = $2`,
        [userId, sourceId],
      );
    },

    /**
     * Delete calibration for a user/source pair.
     */
    async delete(userId: string, sourceId: string): Promise<boolean> {
      const res = await db.query(
        `DELETE FROM source_calibrations WHERE user_id = $1 AND source_id = $2`,
        [userId, sourceId],
      );
      return (res.rowCount ?? 0) > 0;
    },
  };
}
