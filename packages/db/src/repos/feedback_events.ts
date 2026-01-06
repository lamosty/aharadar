import type { FeedbackAction } from "@aharadar/shared";

import type { Queryable } from "../db";

export interface FeedbackEventRow {
  id: string;
  user_id: string;
  digest_id: string | null;
  content_item_id: string;
  action: FeedbackAction;
  created_at: string;
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
        [params.userId, params.digestId ?? null, params.contentItemId, params.action]
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
        [params.userId, Math.max(1, Math.min(500, Math.floor(params.limit)))]
      );
      return res.rows;
    },
  };
}
