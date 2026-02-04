import type { Queryable } from "../db";
import type { PurposeUsageTotals } from "./provider_calls";

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

export interface DigestUsageEstimate {
  schema_version: string;
  basis: Record<string, unknown>;
  triage: Record<string, unknown>;
  deep_summary: Record<string, unknown>;
  totals: Record<string, unknown>;
  notes?: string[];
}

export interface DigestUsageActual {
  schema_version: string;
  totals: PurposeUsageTotals;
  byPurpose: Record<string, PurposeUsageTotals>;
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
  usage_estimate: DigestUsageEstimate | null;
  usage_actual: DigestUsageActual | null;
  error_message: string | null;
  created_at: string;
  scoring_mode_id: string | null;
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
  usage_estimate: DigestUsageEstimate | string | null;
  usage_actual: DigestUsageActual | string | null;
  error_message: string | null;
  created_at: string;
  scoring_mode_id: string | null;
}

function parseDigestRow(raw: DigestRowRaw): DigestRow {
  return {
    ...raw,
    credits_used: parseFloat(raw.credits_used) || 0,
    source_results:
      typeof raw.source_results === "string"
        ? JSON.parse(raw.source_results)
        : (raw.source_results ?? []),
    usage_estimate:
      typeof raw.usage_estimate === "string"
        ? JSON.parse(raw.usage_estimate)
        : (raw.usage_estimate ?? null),
    usage_actual:
      typeof raw.usage_actual === "string"
        ? JSON.parse(raw.usage_actual)
        : (raw.usage_actual ?? null),
  };
}

export function createDigestsRepo(db: Queryable) {
  return {
    async getLatestByUser(userId: string): Promise<DigestRow | null> {
      const res = await db.query<DigestRowRaw>(
        `select id, user_id, topic_id::text as topic_id,
                window_start::text as window_start, window_end::text as window_end,
                mode, status, credits_used, source_results, usage_estimate, usage_actual, error_message,
                created_at::text as created_at, scoring_mode_id::text as scoring_mode_id
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
                mode, status, credits_used, source_results, usage_estimate, usage_actual, error_message,
                created_at::text as created_at, scoring_mode_id::text as scoring_mode_id
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
      usageEstimate?: DigestUsageEstimate | null;
      usageActual?: DigestUsageActual | null;
      errorMessage?: string | null;
      scoringModeId?: string | null;
    }): Promise<{ id: string; inserted: boolean }> {
      const status = params.status ?? "complete";
      const creditsUsed = params.creditsUsed ?? 0;
      const sourceResults = params.sourceResults ?? [];
      const usageEstimate = params.usageEstimate ?? null;
      const usageActual = params.usageActual ?? null;
      const errorMessage = params.errorMessage ?? null;
      const scoringModeId = params.scoringModeId ?? null;

      const res = await db.query<{ id: string; inserted: boolean }>(
        `insert into digests (user_id, topic_id, window_start, window_end, mode, status, credits_used, source_results, usage_estimate, usage_actual, error_message, scoring_mode_id)
         values ($1, $2::uuid, $3::timestamptz, $4::timestamptz, $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb, $11, $12::uuid)
         on conflict (user_id, topic_id, window_start, window_end, mode)
         do update set
           status = excluded.status,
           credits_used = excluded.credits_used,
           source_results = excluded.source_results,
           usage_estimate = excluded.usage_estimate,
           usage_actual = excluded.usage_actual,
           error_message = excluded.error_message,
           scoring_mode_id = excluded.scoring_mode_id
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
          usageEstimate ? JSON.stringify(usageEstimate) : null,
          usageActual ? JSON.stringify(usageActual) : null,
          errorMessage,
          scoringModeId,
        ],
      );
      const row = res.rows[0];
      if (!row) throw new Error("digests.upsert failed: no row returned");
      return row;
    },
  };
}
