import type { Queryable } from "../db";

// catch_up mode removed per task-121; migration deletes existing catch_up digests
export type DigestMode = "low" | "normal" | "high";

// Digest status: 'complete' (all sources succeeded) or 'failed' (source skipped)
export type DigestStatus = "complete" | "failed";

// Per-source result stored in source_results JSONB column
export interface DigestSourceResult {
  sourceId: string;
  sourceName: string;
  sourceType: string;
  status: "ok" | "partial" | "error" | "skipped";
  skipReason?: string;
  itemsFetched: number;
}

export interface DigestRow {
  id: string;
  user_id: string;
  topic_id: string;
  window_start: string;
  window_end: string;
  mode: DigestMode;
  status: DigestStatus;
  credits_used: number;
  source_results: DigestSourceResult[];
  error_message: string | null;
  created_at: string;
}

// Raw row type from DB (before parsing JSONB)
interface DigestRowRaw {
  id: string;
  user_id: string;
  topic_id: string;
  window_start: string;
  window_end: string;
  mode: DigestMode;
  status: DigestStatus;
  credits_used: string; // numeric comes back as string
  source_results: DigestSourceResult[] | string; // JSONB may come as string or parsed
  error_message: string | null;
  created_at: string;
}

function parseDigestRow(raw: DigestRowRaw): DigestRow {
  return {
    ...raw,
    credits_used: parseFloat(raw.credits_used) || 0,
    source_results:
      typeof raw.source_results === "string"
        ? JSON.parse(raw.source_results)
        : (raw.source_results ?? []),
  };
}

export function createDigestsRepo(db: Queryable) {
  return {
    async getLatestByUser(userId: string): Promise<DigestRow | null> {
      const res = await db.query<DigestRowRaw>(
        `select id, user_id, topic_id::text as topic_id,
                window_start::text as window_start, window_end::text as window_end,
                mode, status, credits_used, source_results, error_message,
                created_at::text as created_at
         from digests
         where user_id = $1
         order by created_at desc
         limit 1`,
        [userId],
      );
      const row = res.rows[0];
      return row ? parseDigestRow(row) : null;
    },

    async getLatestByUserAndTopic(params: {
      userId: string;
      topicId: string;
    }): Promise<DigestRow | null> {
      const res = await db.query<DigestRowRaw>(
        `select id, user_id, topic_id::text as topic_id,
                window_start::text as window_start, window_end::text as window_end,
                mode, status, credits_used, source_results, error_message,
                created_at::text as created_at
         from digests
         where user_id = $1 and topic_id = $2::uuid
         order by created_at desc
         limit 1`,
        [params.userId, params.topicId],
      );
      const row = res.rows[0];
      return row ? parseDigestRow(row) : null;
    },

    async upsert(params: {
      userId: string;
      topicId: string;
      windowStart: string;
      windowEnd: string;
      mode: DigestMode;
      status?: DigestStatus;
      creditsUsed?: number;
      sourceResults?: DigestSourceResult[];
      errorMessage?: string | null;
    }): Promise<{ id: string; inserted: boolean }> {
      const status = params.status ?? "complete";
      const creditsUsed = params.creditsUsed ?? 0;
      const sourceResults = params.sourceResults ?? [];
      const errorMessage = params.errorMessage ?? null;

      const res = await db.query<{ id: string; inserted: boolean }>(
        `insert into digests (user_id, topic_id, window_start, window_end, mode, status, credits_used, source_results, error_message)
         values ($1, $2::uuid, $3::timestamptz, $4::timestamptz, $5, $6, $7, $8::jsonb, $9)
         on conflict (user_id, topic_id, window_start, window_end, mode)
         do update set
           status = excluded.status,
           credits_used = excluded.credits_used,
           source_results = excluded.source_results,
           error_message = excluded.error_message
         returning id, (xmax = 0) as inserted`,
        [
          params.userId,
          params.topicId,
          params.windowStart,
          params.windowEnd,
          params.mode,
          status,
          creditsUsed,
          JSON.stringify(sourceResults),
          errorMessage,
        ],
      );
      const row = res.rows[0];
      if (!row) throw new Error("digests.upsert failed: no row returned");
      return row;
    },
  };
}
