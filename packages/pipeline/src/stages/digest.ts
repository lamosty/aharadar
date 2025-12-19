import type { Db } from "@aharadar/db";
import type { BudgetTier } from "@aharadar/shared";

import type { IngestSourceFilter } from "./ingest";

export type DigestMode = BudgetTier | "catch_up";

export interface DigestLimits {
  maxItems: number;
}

export interface DigestRunResult {
  digestId: string;
  mode: DigestMode;
  windowStart: string;
  windowEnd: string;
  items: number;
}

type CandidateRow = {
  id: string;
  candidate_at: string;
  source_type: string;
  metadata_json: Record<string, unknown>;
};

function clamp01(x: number): number {
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return {};
}

function parseIsoMs(value: string): number {
  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms)) throw new Error(`Invalid ISO timestamp: ${value}`);
  return ms;
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getEngagementRaw(meta: Record<string, unknown>): number {
  // Generic-ish engagement heuristic across canonical sources:
  // - reddit: score, num_comments
  // - other sources: may not have these; then engagement becomes 0 and recency dominates.
  const score = asFiniteNumber(meta.score) ?? asFiniteNumber(meta.ups) ?? 0;
  const comments = asFiniteNumber(meta.num_comments) ?? asFiniteNumber(meta.comment_count) ?? 0;

  const safeScore = Math.max(0, score);
  const safeComments = Math.max(0, comments);
  // Log scale to avoid huge-score domination.
  return Math.log1p(safeScore) + 0.25 * Math.log1p(safeComments);
}

function normalize01(values: number[]): number[] {
  if (values.length === 0) return [];
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = max - min;
  if (!Number.isFinite(range) || range < 1e-6) return values.map(() => 0);
  return values.map((v) => clamp01((v - min) / range));
}

function applyCandidateFilterSql(params: {
  filter?: IngestSourceFilter;
  args: unknown[];
}): { whereSql: string; args: unknown[] } {
  const onlyTypes = (params.filter?.onlySourceTypes ?? []).filter((t) => t.trim().length > 0);
  const onlyIds = (params.filter?.onlySourceIds ?? []).filter((id) => id.trim().length > 0);

  let whereSql = "";
  const args = [...params.args];

  if (onlyTypes.length > 0) {
    args.push(onlyTypes);
    whereSql += ` and source_type = any($${args.length}::text[])`;
  }
  if (onlyIds.length > 0) {
    args.push(onlyIds);
    whereSql += ` and source_id = any($${args.length}::uuid[])`;
  }

  return { whereSql, args };
}

export async function persistDigestFromContentItems(params: {
  db: Db;
  userId: string;
  windowStart: string;
  windowEnd: string;
  mode: DigestMode;
  limits?: Partial<DigestLimits>;
  filter?: IngestSourceFilter;
}): Promise<DigestRunResult | null> {
  const maxItems = params.limits?.maxItems ?? 20;
  const candidatePoolSize = Math.min(500, Math.max(maxItems, maxItems * 10));

  const baseArgs: unknown[] = [params.userId, params.windowStart, params.windowEnd, candidatePoolSize];
  const filtered = applyCandidateFilterSql({ filter: params.filter, args: baseArgs });

  const candidates = await params.db.query<CandidateRow>(
    `select
       id::text as id,
       coalesce(published_at, fetched_at)::text as candidate_at,
       source_type,
       metadata_json
     from content_items
     where user_id = $1
       and deleted_at is null
       and duplicate_of_content_item_id is null
       and coalesce(published_at, fetched_at) >= $2::timestamptz
       and coalesce(published_at, fetched_at) < $3::timestamptz
       ${filtered.whereSql}
     order by coalesce(published_at, fetched_at) desc
     limit $4`,
    filtered.args
  );

  if (candidates.rows.length === 0) return null;

  const windowStartMs = parseIsoMs(params.windowStart);
  const windowEndMs = parseIsoMs(params.windowEnd);
  const windowMs = Math.max(1, windowEndMs - windowStartMs);

  const recencies: number[] = [];
  const engagements: number[] = [];

  const base = candidates.rows.map((row) => {
    const tMs = parseIsoMs(row.candidate_at);
    const ageMs = Math.max(0, windowEndMs - tMs);
    const recency = clamp01(1 - ageMs / windowMs);
    const meta = asRecord(row.metadata_json);
    const engagementRaw = getEngagementRaw(meta);
    recencies.push(recency);
    engagements.push(engagementRaw);
    return {
      contentItemId: row.id,
      candidateAtMs: tMs,
      sourceType: row.source_type,
      recency,
      engagementRaw,
    };
  });

  const engagementNorm = normalize01(engagements);

  const wRecency = 0.6;
  const wEngagement = 0.4;

  const scored = base.map((b, idx) => {
    const e = engagementNorm[idx] ?? 0;
    const score = wRecency * b.recency + wEngagement * e;
    return { contentItemId: b.contentItemId, score, candidateAtMs: b.candidateAtMs };
  });

  scored.sort((a, b) => b.score - a.score || b.candidateAtMs - a.candidateAtMs);

  const selected = scored.slice(0, maxItems);
  const items = selected.map((s) => ({ contentItemId: s.contentItemId, score: s.score }));

  const digest = await params.db.tx(async (tx) => {
    const res = await tx.digests.upsert({
      userId: params.userId,
      windowStart: params.windowStart,
      windowEnd: params.windowEnd,
      mode: params.mode,
    });
    await tx.digestItems.replaceForDigest({ digestId: res.id, items });
    return res;
  });

  return {
    digestId: digest.id,
    mode: params.mode,
    windowStart: params.windowStart,
    windowEnd: params.windowEnd,
    items: items.length,
  };
}
