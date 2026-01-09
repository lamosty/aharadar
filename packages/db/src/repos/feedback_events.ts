import type { FeedbackAction, SourceType } from "@aharadar/shared";

import type { Queryable } from "../db";

export interface FeedbackEventRow {
  id: string;
  user_id: string;
  digest_id: string | null;
  content_item_id: string;
  action: FeedbackAction;
  created_at: string;
}

/**
 * User preference weights computed from feedback history.
 * Weights are multipliers (1.0 = neutral, >1 = boosted, <1 = penalized).
 * All weights are clamped to [0.5, 2.0] to prevent extreme values.
 */
export interface UserPreferences {
  sourceTypeWeights: Partial<Record<SourceType, number>>;
  authorWeights: Record<string, number>;
}

export function createFeedbackEventsRepo(db: Queryable) {
  return {
    async insert(params: {
      userId: string;
      digestId?: string | null;
      contentItemId: string;
      action: FeedbackAction;
    }): Promise<{ id: string }> {
      const res = await db.query<{ id: string }>(
        `insert into feedback_events (user_id, digest_id, content_item_id, action)
         values ($1, $2::uuid, $3::uuid, $4)
         returning id`,
        [params.userId, params.digestId ?? null, params.contentItemId, params.action],
      );
      const row = res.rows[0];
      if (!row) throw new Error("Failed to insert feedback_event");
      return row;
    },

    async listRecentByUser(params: { userId: string; limit: number }): Promise<FeedbackEventRow[]> {
      const res = await db.query<FeedbackEventRow>(
        `select
           id,
           user_id,
           digest_id::text as digest_id,
           content_item_id::text as content_item_id,
           action,
           created_at::text as created_at
         from feedback_events
         where user_id = $1
         order by created_at desc
         limit $2`,
        [params.userId, Math.max(1, Math.min(500, Math.floor(params.limit)))],
      );
      return res.rows;
    },

    /**
     * Delete all feedback events for a content item (undo/clear).
     * Returns the number of deleted rows.
     */
    async deleteByContentItem(params: { userId: string; contentItemId: string }): Promise<number> {
      const res = await db.query<{ count: number }>(
        `with deleted as (
           delete from feedback_events
           where user_id = $1 and content_item_id = $2::uuid
           returning 1
         )
         select count(*)::int as count from deleted`,
        [params.userId, params.contentItemId],
      );
      return res.rows[0]?.count ?? 0;
    },

    /**
     * Compute user preference weights from feedback history.
     * Like/save → +0.1 weight, dislike → -0.1 weight.
     * Weights are clamped to [0.5, 2.0].
     *
     * @param userId - The user to compute preferences for
     * @param maxFeedbackAge - Optional max age in days (default: no limit)
     * @returns UserPreferences with sourceTypeWeights and authorWeights
     */
    async computeUserPreferences(params: {
      userId: string;
      maxFeedbackAgeDays?: number;
    }): Promise<UserPreferences> {
      const { userId, maxFeedbackAgeDays } = params;

      // Query feedback with joined content_items for source_type and author
      const ageFilter = maxFeedbackAgeDays
        ? `and fe.created_at > now() - interval '${maxFeedbackAgeDays} days'`
        : "";

      const res = await db.query<{
        source_type: SourceType;
        author: string | null;
        action: FeedbackAction;
      }>(
        `select
           ci.source_type,
           ci.author,
           fe.action
         from feedback_events fe
         join content_items ci on ci.id = fe.content_item_id
         where fe.user_id = $1
           ${ageFilter}
         order by fe.created_at desc
         limit 1000`,
        [userId],
      );

      // Aggregate by source type and author
      const sourceTypeScores: Record<string, number> = {};
      const authorScores: Record<string, number> = {};

      const WEIGHT_DELTA = 0.1;
      const MIN_WEIGHT = 0.5;
      const MAX_WEIGHT = 2.0;

      for (const row of res.rows) {
        const delta =
          row.action === "like" || row.action === "save"
            ? WEIGHT_DELTA
            : row.action === "dislike"
              ? -WEIGHT_DELTA
              : 0; // skip has no effect

        if (delta !== 0) {
          // Source type weight
          sourceTypeScores[row.source_type] = (sourceTypeScores[row.source_type] ?? 0) + delta;

          // Author weight (if author exists)
          if (row.author) {
            authorScores[row.author] = (authorScores[row.author] ?? 0) + delta;
          }
        }
      }

      // Convert accumulated scores to weights (base 1.0 + accumulated delta)
      // and clamp to [MIN_WEIGHT, MAX_WEIGHT]
      const clamp = (val: number) => Math.max(MIN_WEIGHT, Math.min(MAX_WEIGHT, val));

      const sourceTypeWeights: Partial<Record<SourceType, number>> = {};
      for (const [sourceType, score] of Object.entries(sourceTypeScores)) {
        sourceTypeWeights[sourceType as SourceType] = clamp(1.0 + score);
      }

      const authorWeights: Record<string, number> = {};
      for (const [author, score] of Object.entries(authorScores)) {
        authorWeights[author] = clamp(1.0 + score);
      }

      return { sourceTypeWeights, authorWeights };
    },
  };
}
