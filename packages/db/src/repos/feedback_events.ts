import type {
  FeedbackAction,
  FeedbackByTopic,
  FeedbackDailyStats,
  FeedbackSummary,
  SourceType,
} from "@aharadar/shared";

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
     * Like → +weightDelta weight, dislike → -weightDelta weight.
     * Weights are clamped to [0.5, 2.0].
     *
     * @param userId - The user to compute preferences for
     * @param maxFeedbackAgeDays - Optional max age in days (default: no limit)
     * @param weightDelta - Weight change per feedback (default: 0.1)
     * @returns UserPreferences with sourceTypeWeights and authorWeights
     */
    async computeUserPreferences(params: {
      userId: string;
      maxFeedbackAgeDays?: number;
      weightDelta?: number;
    }): Promise<UserPreferences> {
      const { userId, maxFeedbackAgeDays, weightDelta } = params;

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

      const effectiveWeightDelta = weightDelta ?? 0.1;
      const MIN_WEIGHT = 0.5;
      const MAX_WEIGHT = 2.0;

      for (const row of res.rows) {
        const delta =
          row.action === "like"
            ? effectiveWeightDelta
            : row.action === "dislike"
              ? -effectiveWeightDelta
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

    /**
     * Get daily feedback statistics for charts.
     * Returns one row per day with counts for each action type.
     *
     * @param userId - The user to get stats for
     * @param days - Number of days to look back (default: 30)
     */
    async getDailyStats(params: { userId: string; days?: number }): Promise<FeedbackDailyStats[]> {
      const { userId, days = 30 } = params;

      const res = await db.query<{
        date: string;
        likes: string;
        dislikes: string;
        skips: string;
      }>(
        `with date_series as (
           select generate_series(
             current_date - interval '1 day' * ($2 - 1),
             current_date,
             interval '1 day'
           )::date as date
         ),
         daily_counts as (
           select
             date(created_at) as date,
             count(*) filter (where action = 'like') as likes,
             count(*) filter (where action = 'dislike') as dislikes,
             count(*) filter (where action = 'skip') as skips
           from feedback_events
           where user_id = $1
             and created_at >= current_date - interval '1 day' * $2
           group by date(created_at)
         )
         select
           ds.date::text as date,
           coalesce(dc.likes, 0)::text as likes,
           coalesce(dc.dislikes, 0)::text as dislikes,
           coalesce(dc.skips, 0)::text as skips
         from date_series ds
         left join daily_counts dc on dc.date = ds.date
         order by ds.date asc`,
        [userId, days],
      );

      return res.rows.map((row) => ({
        date: row.date,
        likes: parseInt(row.likes, 10),
        dislikes: parseInt(row.dislikes, 10),
        skips: parseInt(row.skips, 10),
      }));
    },

    /**
     * Get summary statistics for all feedback.
     * Includes total counts and quality ratio.
     */
    async getSummary(params: { userId: string }): Promise<FeedbackSummary> {
      const res = await db.query<{
        total: string;
        likes: string;
        dislikes: string;
        skips: string;
      }>(
        `select
           count(*)::text as total,
           count(*) filter (where action = 'like')::text as likes,
           count(*) filter (where action = 'dislike')::text as dislikes,
           count(*) filter (where action = 'skip')::text as skips
         from feedback_events
         where user_id = $1`,
        [params.userId],
      );

      const row = res.rows[0];
      if (!row) {
        return {
          total: 0,
          byAction: { like: 0, dislike: 0, skip: 0 },
          qualityRatio: null,
        };
      }

      const likes = parseInt(row.likes, 10);
      const dislikes = parseInt(row.dislikes, 10);
      const skips = parseInt(row.skips, 10);

      // Quality ratio = likes / dislikes
      const qualityRatio = dislikes > 0 ? likes / dislikes : null;

      return {
        total: parseInt(row.total, 10),
        byAction: { like: likes, dislike: dislikes, skip: skips },
        qualityRatio,
      };
    },

    /**
     * Get feedback breakdown by topic.
     * Joins through content_item_sources → sources → topics.
     */
    async getByTopic(params: { userId: string }): Promise<FeedbackByTopic[]> {
      const res = await db.query<{
        topic_id: string;
        topic_name: string;
        likes: string;
        dislikes: string;
        skips: string;
      }>(
        `select
           t.id::text as topic_id,
           t.name as topic_name,
           count(*) filter (where fe.action = 'like')::text as likes,
           count(*) filter (where fe.action = 'dislike')::text as dislikes,
           count(*) filter (where fe.action = 'skip')::text as skips
         from feedback_events fe
         join content_items ci on ci.id = fe.content_item_id
         join content_item_sources cis on cis.content_item_id = ci.id
         join sources s on s.id = cis.source_id
         join topics t on t.id = s.topic_id
         where fe.user_id = $1
         group by t.id, t.name
         order by t.name asc`,
        [params.userId],
      );

      return res.rows.map((row) => ({
        topicId: row.topic_id,
        topicName: row.topic_name,
        likes: parseInt(row.likes, 10),
        dislikes: parseInt(row.dislikes, 10),
        skips: parseInt(row.skips, 10),
      }));
    },
  };
}
