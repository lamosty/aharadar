import type { Queryable } from "../db";

export type DigestMode = "low" | "normal" | "high" | "catch_up";

export interface DigestRow {
  id: string;
  user_id: string;
  topic_id: string;
  window_start: string;
  window_end: string;
  mode: DigestMode;
  created_at: string;
}

export function createDigestsRepo(db: Queryable) {
  return {
    async getLatestByUser(userId: string): Promise<DigestRow | null> {
      const res = await db.query<DigestRow>(
        `select id, user_id, topic_id::text as topic_id, window_start::text as window_start, window_end::text as window_end, mode, created_at::text as created_at
         from digests
         where user_id = $1
         order by created_at desc
         limit 1`,
        [userId],
      );
      return res.rows[0] ?? null;
    },

    async getLatestByUserAndTopic(params: {
      userId: string;
      topicId: string;
    }): Promise<DigestRow | null> {
      const res = await db.query<DigestRow>(
        `select id, user_id, topic_id::text as topic_id, window_start::text as window_start, window_end::text as window_end, mode, created_at::text as created_at
         from digests
         where user_id = $1 and topic_id = $2::uuid
         order by created_at desc
         limit 1`,
        [params.userId, params.topicId],
      );
      return res.rows[0] ?? null;
    },

    async upsert(params: {
      userId: string;
      topicId: string;
      windowStart: string;
      windowEnd: string;
      mode: DigestMode;
    }): Promise<{ id: string; inserted: boolean }> {
      const res = await db.query<{ id: string; inserted: boolean }>(
        `insert into digests (user_id, topic_id, window_start, window_end, mode)
         values ($1, $2::uuid, $3::timestamptz, $4::timestamptz, $5)
         on conflict (user_id, topic_id, window_start, window_end, mode)
         do update set window_start = excluded.window_start
         returning id, (xmax = 0) as inserted`,
        [params.userId, params.topicId, params.windowStart, params.windowEnd, params.mode],
      );
      const row = res.rows[0];
      if (!row) throw new Error("digests.upsert failed: no row returned");
      return row;
    },
  };
}
