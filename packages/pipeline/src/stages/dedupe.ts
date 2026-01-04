import type { Db } from "@aharadar/db";

export interface DedupeLimits {
  /**
   * Max number of in-window candidates to consider per run.
   * (This is about controlling runtime, not budget credits.)
   */
  maxItems: number;
  /** How far back we look for potential originals. */
  lookbackDays: number;
  /**
   * Cosine similarity threshold above which we mark an item as a near-duplicate.
   * Keep this VERY high to avoid false positives.
   */
  similarityThreshold: number;
}

export interface DedupeRunResult {
  attempted: number;
  matches: number;
  deduped: number;
}

function parseIntEnv(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseFloatEnv(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseIsoMs(value: string): number {
  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms)) throw new Error(`Invalid ISO timestamp: ${value}`);
  return ms;
}

function clamp01(x: number): number {
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

/**
 * Dedupe within a topic:
 * - "hard" dedupe is already handled by DB uniqueness on (source_id, external_id) and hash_url.
 * - this stage optionally marks *near duplicates* using embeddings similarity, scoped to the topic.
 *
 * Notes:
 * - We exclude signal *bundles* from near-duplicate marking; signal posts (`signal_post_v1`) are eligible like other content.
 * - We only mark duplicates where the nearest older neighbor similarity is above a very high threshold.
 */
export async function dedupeTopicContentItems(params: {
  db: Db;
  userId: string;
  topicId: string;
  windowStart: string;
  windowEnd: string;
  limits?: Partial<DedupeLimits>;
}): Promise<DedupeRunResult> {
  const maxItems = params.limits?.maxItems ?? parseIntEnv(process.env.DEDUPE_MAX_ITEMS_PER_RUN) ?? 500;
  const lookbackDays = params.limits?.lookbackDays ?? parseIntEnv(process.env.DEDUPE_LOOKBACK_DAYS) ?? 30;
  const similarityThreshold =
    params.limits?.similarityThreshold ??
    parseFloatEnv(process.env.DEDUPE_NEAR_DUP_SIM_THRESHOLD) ??
    0.995;

  const threshold = clamp01(similarityThreshold);

  const winStartMs = parseIsoMs(params.windowStart);
  const lookbackStartMs = winStartMs - Math.max(0, lookbackDays) * 24 * 60 * 60 * 1000;
  const lookbackStartIso = new Date(lookbackStartMs).toISOString();

  const limit = Math.max(0, Math.min(5_000, Math.floor(maxItems)));

  if (limit === 0) return { attempted: 0, matches: 0, deduped: 0 };

  const res = await params.db.query<{ attempted: number; matches: number; deduped: number }>(
    `with topic_membership as (
       select distinct cis.content_item_id
       from content_item_sources cis
       join sources s on s.id = cis.source_id
       where s.user_id = $1
         and s.topic_id = $2::uuid
     ),
     candidates as (
       select
         ci.id,
         e.vector as v,
         coalesce(ci.published_at, ci.fetched_at) as t
       from content_items ci
       join embeddings e on e.content_item_id = ci.id
       join topic_membership tm on tm.content_item_id = ci.id
       where ci.user_id = $1
         and ci.deleted_at is null
         and ci.duplicate_of_content_item_id is null
         and (
           ci.source_type <> 'signal'
           or ci.metadata_json->>'kind' = 'signal_post_v1'
         )
         and coalesce(ci.published_at, ci.fetched_at) >= $3::timestamptz
         and coalesce(ci.published_at, ci.fetched_at) < $4::timestamptz
       order by coalesce(ci.published_at, ci.fetched_at) desc
       limit $5
     ),
     matches as (
       select
         c.id as dup_id,
         nn.id as orig_id,
         nn.similarity
       from candidates c
       join lateral (
         select
           ci2.id,
           (1 - (e2.vector <=> c.v))::float8 as similarity
         from embeddings e2
         join content_items ci2 on ci2.id = e2.content_item_id
         join topic_membership tm2 on tm2.content_item_id = ci2.id
         where ci2.user_id = $1
           and ci2.deleted_at is null
           and ci2.duplicate_of_content_item_id is null
           and (
             ci2.source_type <> 'signal'
             or ci2.metadata_json->>'kind' = 'signal_post_v1'
           )
           and ci2.id <> c.id
           and coalesce(ci2.published_at, ci2.fetched_at) < c.t
           and coalesce(ci2.published_at, ci2.fetched_at) >= $6::timestamptz
         order by e2.vector <=> c.v asc
         limit 1
       ) nn on true
       where nn.similarity >= $7
     ),
     updated as (
       update content_items ci
       set duplicate_of_content_item_id = m.orig_id
       from matches m
       where ci.id = m.dup_id
       returning ci.id
     )
     select
       (select count(*) from candidates)::int as attempted,
       (select count(*) from matches)::int as matches,
       (select count(*) from updated)::int as deduped`,
    [params.userId, params.topicId, params.windowStart, params.windowEnd, limit, lookbackStartIso, threshold]
  );

  const row = res.rows[0];
  if (!row) return { attempted: 0, matches: 0, deduped: 0 };
  return {
    attempted: row.attempted ?? 0,
    matches: row.matches ?? 0,
    deduped: row.deduped ?? 0,
  };
}

