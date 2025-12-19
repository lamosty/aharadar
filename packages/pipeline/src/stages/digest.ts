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

type CandidateRow = { id: string; candidate_at: string };

function clamp01(x: number): number {
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function parseIsoMs(value: string): number {
  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms)) throw new Error(`Invalid ISO timestamp: ${value}`);
  return ms;
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

  const baseArgs: unknown[] = [params.userId, params.windowStart, params.windowEnd, maxItems];
  const filtered = applyCandidateFilterSql({ filter: params.filter, args: baseArgs });

  const candidates = await params.db.query<CandidateRow>(
    `select
       id::text as id,
       coalesce(published_at, fetched_at)::text as candidate_at
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

  const items = candidates.rows.map((row) => {
    const tMs = parseIsoMs(row.candidate_at);
    const ageMs = Math.max(0, windowEndMs - tMs);
    const recency = clamp01(1 - ageMs / windowMs);
    return { contentItemId: row.id, score: recency };
  });

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
