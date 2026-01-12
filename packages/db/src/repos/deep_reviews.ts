import type { SourceType } from "@aharadar/shared";

import type { Queryable } from "../db";

export type DeepReviewStatus = "preview" | "promoted" | "dropped";

export interface DeepReviewRow {
  id: string;
  user_id: string;
  content_item_id: string;
  status: DeepReviewStatus;
  summary_json: unknown | null;
  created_at: string;
  updated_at: string;
}

export interface DeepReviewQueueItem {
  id: string;
  title: string | null;
  bodyText: string | null;
  url: string | null;
  author: string | null;
  sourceType: SourceType;
  publishedAt: string | null;
  likedAt: string;
  score: number;
  triageJson: Record<string, unknown> | null;
  /** Existing preview summary if already generated */
  previewSummaryJson: Record<string, unknown> | null;
}

export interface PromotedItem {
  id: string;
  title: string | null;
  bodyText: string | null;
  url: string | null;
  author: string | null;
  sourceType: SourceType;
  publishedAt: string | null;
  summaryJson: unknown | null;
  promotedAt: string;
}

export function createDeepReviewsRepo(db: Queryable) {
  return {
    /**
     * Upsert a deep review decision (promote or drop).
     * If a decision already exists for this user+item, it will be updated.
     */
    async upsertDecision(params: {
      userId: string;
      contentItemId: string;
      status: DeepReviewStatus;
      summaryJson?: unknown;
    }): Promise<{ id: string }> {
      const res = await db.query<{ id: string }>(
        `insert into content_item_deep_reviews (user_id, content_item_id, status, summary_json)
         values ($1, $2::uuid, $3, $4::jsonb)
         on conflict (user_id, content_item_id)
         do update set
           status = excluded.status,
           summary_json = excluded.summary_json,
           updated_at = now()
         returning id::text`,
        [params.userId, params.contentItemId, params.status, params.summaryJson ?? null],
      );
      const row = res.rows[0];
      if (!row) throw new Error("Failed to upsert deep review decision");
      return row;
    },

    /**
     * Get the queue of liked items that haven't been reviewed yet.
     * Returns items where user's latest feedback = 'like' and no deep review decision exists.
     */
    async getQueueForUser(params: {
      userId: string;
      limit?: number;
      offset?: number;
    }): Promise<DeepReviewQueueItem[]> {
      const { userId, limit = 50, offset = 0 } = params;

      const res = await db.query<{
        id: string;
        title: string | null;
        body_text: string | null;
        url: string | null;
        author: string | null;
        source_type: string;
        published_at: string | null;
        liked_at: string;
        score: number | null;
        triage_json: Record<string, unknown> | null;
        preview_summary_json: Record<string, unknown> | null;
      }>(
        `with latest_feedback as (
           -- Get the most recent feedback action per content item for this user
           select distinct on (content_item_id)
             content_item_id,
             action,
             created_at as liked_at
           from feedback_events
           where user_id = $1
           order by content_item_id, created_at desc
         ),
         latest_digest_item as (
           -- Get the most recent digest_item for score and triage_json
           select distinct on (di.content_item_id)
             di.content_item_id,
             di.score,
             di.triage_json
           from digest_items di
           join digests d on d.id = di.digest_id
           order by di.content_item_id, d.created_at desc
         )
         select
           ci.id::text as id,
           ci.title,
           ci.body_text,
           ci.canonical_url as url,
           ci.author,
           ci.source_type,
           ci.published_at::text as published_at,
           lf.liked_at::text as liked_at,
           ldi.score,
           ldi.triage_json,
           dr.summary_json as preview_summary_json
         from latest_feedback lf
         join content_items ci on ci.id = lf.content_item_id
         left join content_item_deep_reviews dr
           on dr.content_item_id = lf.content_item_id
           and dr.user_id = $1
         left join latest_digest_item ldi on ldi.content_item_id = ci.id
         where lf.action = 'like'
           and (dr.id is null or dr.status = 'preview')
         order by lf.liked_at desc
         limit $2
         offset $3`,
        [userId, Math.max(1, Math.min(100, limit)), Math.max(0, offset)],
      );

      return res.rows.map((row) => ({
        id: row.id,
        title: row.title,
        bodyText: row.body_text,
        url: row.url,
        author: row.author,
        sourceType: row.source_type as SourceType,
        publishedAt: row.published_at,
        likedAt: row.liked_at,
        score: row.score ?? 0,
        triageJson: row.triage_json,
        previewSummaryJson: row.preview_summary_json,
      }));
    },

    /**
     * Get promoted items with their summaries.
     */
    async getPromotedForUser(params: {
      userId: string;
      limit?: number;
      offset?: number;
    }): Promise<PromotedItem[]> {
      const { userId, limit = 50, offset = 0 } = params;

      const res = await db.query<{
        id: string;
        title: string | null;
        body_text: string | null;
        url: string | null;
        author: string | null;
        source_type: string;
        published_at: string | null;
        summary_json: unknown | null;
        promoted_at: string;
      }>(
        `select
           ci.id::text as id,
           ci.title,
           ci.body_text,
           ci.canonical_url as url,
           ci.author,
           ci.source_type,
           ci.published_at::text as published_at,
           dr.summary_json,
           dr.created_at::text as promoted_at
         from content_item_deep_reviews dr
         join content_items ci on ci.id = dr.content_item_id
         where dr.user_id = $1
           and dr.status = 'promoted'
         order by dr.created_at desc
         limit $2
         offset $3`,
        [userId, Math.max(1, Math.min(100, limit)), Math.max(0, offset)],
      );

      return res.rows.map((row) => ({
        id: row.id,
        title: row.title,
        bodyText: row.body_text,
        url: row.url,
        author: row.author,
        sourceType: row.source_type as SourceType,
        publishedAt: row.published_at,
        summaryJson: row.summary_json,
        promotedAt: row.promoted_at,
      }));
    },
  };
}
