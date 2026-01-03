import type { Db } from "@aharadar/db";
import { createEnvLlmRouter, triageCandidate, type TriageOutput } from "@aharadar/llm";
import type { BudgetTier } from "@aharadar/shared";

import type { IngestSourceFilter } from "./ingest";
import { rankCandidates } from "./rank";
import { enrichTopCandidates } from "./llm_enrich";

export type DigestMode = BudgetTier | "catch_up";

export interface DigestLimits {
  maxItems: number;
}

export interface DigestRunResult {
  digestId: string;
  mode: DigestMode;
  topicId: string;
  windowStart: string;
  windowEnd: string;
  items: number;
}

type CandidateRow = {
  kind: "cluster" | "item";
  candidate_id: string;
  candidate_at: string;
  rep_content_item_id: string;
  source_id: string;
  source_type: string;
  source_name: string | null;
  title: string | null;
  body_text: string | null;
  canonical_url: string | null;
  author: string | null;
  published_at: string | null;
  metadata_json: Record<string, unknown>;
  vector_text: string | null;
  positive_sim: number | null;
  negative_sim: number | null;
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

function parseIntEnv(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
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

function getPrimaryUrl(params: {
  canonicalUrl: string | null;
  metadata: Record<string, unknown>;
}): string | null {
  if (params.canonicalUrl) return params.canonicalUrl;
  const primary = params.metadata.primary_url;
  if (typeof primary === "string" && primary.length > 0) return primary;
  const extracted = params.metadata.extracted_urls;
  if (Array.isArray(extracted) && extracted.length > 0) {
    const first = extracted[0];
    if (typeof first === "string" && first.length > 0) return first;
  }
  return null;
}

function resolveBudgetTier(mode: DigestMode): BudgetTier {
  return mode === "catch_up" ? "high" : mode;
}

function resolveTriageLimit(params: { maxItems: number; candidateCount: number }): number {
  const envLimit = parseIntEnv(process.env.OPENAI_TRIAGE_MAX_CALLS_PER_RUN);
  const defaultLimit = Math.min(params.candidateCount, Math.max(params.maxItems, params.maxItems * 5));
  if (envLimit !== null) return Math.max(0, Math.min(envLimit, params.candidateCount));
  return defaultLimit;
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
    whereSql += ` and s.type = any($${args.length}::text[])`;
  }
  if (onlyIds.length > 0) {
    args.push(onlyIds);
    whereSql += ` and s.id = any($${args.length}::uuid[])`;
  }

  return { whereSql, args };
}

async function triageCandidates(params: {
  db: Db;
  userId: string;
  candidates: Array<{
    candidateId: string;
    kind: "cluster" | "item";
    representativeContentItemId: string;
    sourceId: string;
    sourceType: string;
    sourceName: string | null;
    title: string | null;
    bodyText: string | null;
    canonicalUrl: string | null;
    author: string | null;
    publishedAt: string | null;
    metadata: Record<string, unknown>;
  }>;
  windowStart: string;
  windowEnd: string;
  mode: DigestMode;
  maxCalls: number;
}): Promise<Map<string, TriageOutput>> {
  if (params.maxCalls <= 0 || params.candidates.length === 0) return new Map();

  let router: ReturnType<typeof createEnvLlmRouter> | null = null;
  try {
    router = createEnvLlmRouter();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`LLM triage disabled: ${message}`);
    return new Map();
  }
  if (!router) return new Map();

  const tier = resolveBudgetTier(params.mode);
  const triageMap = new Map<string, TriageOutput>();

  for (const candidate of params.candidates.slice(0, params.maxCalls)) {
    const ref = router.chooseModel("triage", tier);
    const startedAt = new Date().toISOString();
    try {
      const result = await triageCandidate({
        router,
        tier,
        candidate: {
          id: candidate.candidateId,
          title: candidate.title,
          bodyText: candidate.bodyText,
          sourceType: candidate.sourceType,
          sourceName: candidate.sourceName,
          primaryUrl: getPrimaryUrl({
            canonicalUrl: candidate.canonicalUrl,
            metadata: candidate.metadata,
          }),
          author: candidate.author,
          publishedAt: candidate.publishedAt,
          windowStart: params.windowStart,
          windowEnd: params.windowEnd,
        },
      });

      triageMap.set(candidate.candidateId, result.output);

      const endedAt = new Date().toISOString();
      try {
        await params.db.providerCalls.insert({
          userId: params.userId,
          purpose: "triage",
          provider: result.provider,
          model: result.model,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          costEstimateCredits: result.costEstimateCredits,
          meta: {
            candidateId: candidate.candidateId,
            kind: candidate.kind,
            representativeContentItemId: candidate.representativeContentItemId,
            sourceId: candidate.sourceId,
            sourceType: candidate.sourceType,
            windowStart: params.windowStart,
            windowEnd: params.windowEnd,
            endpoint: result.endpoint,
            promptId: result.output.prompt_id,
            schemaVersion: result.output.schema_version,
          },
          startedAt,
          endedAt,
          status: "ok",
        });
      } catch (err) {
        console.warn("provider_calls insert failed (triage)", err);
      }
    } catch (err) {
      const endedAt = new Date().toISOString();
      const errObj = err && typeof err === "object" ? (err as Record<string, unknown>) : {};
      try {
        await params.db.providerCalls.insert({
          userId: params.userId,
          purpose: "triage",
          provider: ref.provider,
          model: ref.model,
          inputTokens: 0,
          outputTokens: 0,
          costEstimateCredits: 0,
          meta: {
            candidateId: candidate.candidateId,
            kind: candidate.kind,
            representativeContentItemId: candidate.representativeContentItemId,
            sourceId: candidate.sourceId,
            sourceType: candidate.sourceType,
            windowStart: params.windowStart,
            windowEnd: params.windowEnd,
            endpoint: ref.endpoint,
          },
          startedAt,
          endedAt,
          status: "error",
          error: {
            message: err instanceof Error ? err.message : String(err),
            statusCode: errObj.statusCode,
            responseSnippet: errObj.responseSnippet,
          },
        });
      } catch (err) {
        console.warn("provider_calls insert failed (triage error)", err);
      }

      console.warn(
        `triage failed for candidate ${candidate.candidateId}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return triageMap;
}

export async function persistDigestFromContentItems(params: {
  db: Db;
  userId: string;
  topicId: string;
  windowStart: string;
  windowEnd: string;
  mode: DigestMode;
  limits?: Partial<DigestLimits>;
  filter?: IngestSourceFilter;
}): Promise<DigestRunResult | null> {
  const maxItems = params.limits?.maxItems ?? 20;
  const candidatePoolSize = Math.min(500, Math.max(maxItems, maxItems * 10));

  const baseArgs: unknown[] = [params.userId, params.topicId, params.windowStart, params.windowEnd, candidatePoolSize];
  const filtered = applyCandidateFilterSql({ filter: params.filter, args: baseArgs });

  const candidates = await params.db.query<CandidateRow>(
    `with topic_membership as (
       select distinct cis.content_item_id
       from content_item_sources cis
       join sources s on s.id = cis.source_id
       where s.user_id = $1
         and s.topic_id = $2::uuid
         ${filtered.whereSql}
     ),
     topic_item_source as (
       select distinct on (cis.content_item_id)
         cis.content_item_id,
         cis.source_id
       from content_item_sources cis
       join sources s on s.id = cis.source_id
       where s.user_id = $1
         and s.topic_id = $2::uuid
         ${filtered.whereSql}
       order by cis.content_item_id, cis.added_at desc
     ),
     window_topic_items as (
       select
         ci.id,
         coalesce(ci.published_at, ci.fetched_at) as t
       from content_items ci
       join topic_membership tm on tm.content_item_id = ci.id
       where ci.user_id = $1
         and ci.deleted_at is null
         and ci.duplicate_of_content_item_id is null
         and coalesce(ci.published_at, ci.fetched_at) >= $3::timestamptz
         and coalesce(ci.published_at, ci.fetched_at) < $4::timestamptz
     ),
     cluster_candidates as (
       select
         cli.cluster_id,
         max(wti.t) as candidate_at
       from window_topic_items wti
       join cluster_items cli on cli.content_item_id = wti.id
       group by cli.cluster_id
     ),
     cluster_rows as (
       select
         'cluster'::text as kind,
         cc.cluster_id::text as candidate_id,
         cc.candidate_at::text as candidate_at,
         rep.id::text as rep_content_item_id,
         tis.source_id::text as source_id,
         s.type as source_type,
         s.name as source_name,
         rep.title,
         rep.body_text,
         rep.canonical_url,
         rep.author,
         rep.published_at::text as published_at,
         rep.metadata_json,
         c.centroid_vector::text as vector_text,
         (case
            when p.positive_vector is not null and c.centroid_vector is not null then (1 - (c.centroid_vector <=> p.positive_vector))::float8
            else null
          end) as positive_sim,
         (case
            when p.negative_vector is not null and c.centroid_vector is not null then (1 - (c.centroid_vector <=> p.negative_vector))::float8
            else null
          end) as negative_sim
       from cluster_candidates cc
       join clusters c on c.id = cc.cluster_id
       join lateral (
         select ci.*
         from cluster_items cli
         join content_items ci on ci.id = cli.content_item_id
         join topic_membership tm on tm.content_item_id = ci.id
         where cli.cluster_id = cc.cluster_id
           and ci.user_id = $1
           and ci.deleted_at is null
           and ci.duplicate_of_content_item_id is null
           and coalesce(ci.published_at, ci.fetched_at) >= $3::timestamptz
           and coalesce(ci.published_at, ci.fetched_at) < $4::timestamptz
         order by coalesce(ci.published_at, ci.fetched_at) desc
         limit 1
       ) rep on true
       join topic_item_source tis on tis.content_item_id = rep.id
       join sources s on s.id = tis.source_id
       left join topic_preference_profiles p on p.user_id = $1 and p.topic_id = $2::uuid
     ),
     item_rows as (
       select
         'item'::text as kind,
         ci.id::text as candidate_id,
         coalesce(ci.published_at, ci.fetched_at)::text as candidate_at,
         ci.id::text as rep_content_item_id,
         tis.source_id::text as source_id,
         s.type as source_type,
         s.name as source_name,
         ci.title,
         ci.body_text,
         ci.canonical_url,
         ci.author,
         ci.published_at::text as published_at,
         ci.metadata_json,
         e.vector::text as vector_text,
         (case
            when p.positive_vector is not null and e.vector is not null then (1 - (e.vector <=> p.positive_vector))::float8
            else null
          end) as positive_sim,
         (case
            when p.negative_vector is not null and e.vector is not null then (1 - (e.vector <=> p.negative_vector))::float8
            else null
          end) as negative_sim
       from content_items ci
       join window_topic_items wti on wti.id = ci.id
       join topic_item_source tis on tis.content_item_id = ci.id
       join sources s on s.id = tis.source_id
       left join embeddings e on e.content_item_id = ci.id
       left join topic_preference_profiles p on p.user_id = $1 and p.topic_id = $2::uuid
       where not exists (
         select 1 from cluster_items cli
         where cli.content_item_id = ci.id
       )
     )
     select *
     from (
       select * from cluster_rows
       union all
       select * from item_rows
     ) u
     order by u.candidate_at desc
     limit $5`,
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
      candidateId: row.candidate_id,
      kind: row.kind,
      representativeContentItemId: row.rep_content_item_id,
      candidateAtMs: tMs,
      sourceId: row.source_id,
      sourceType: row.source_type,
      sourceName: row.source_name,
      title: row.title,
      bodyText: row.body_text,
      canonicalUrl: row.canonical_url,
      author: row.author,
      publishedAt: row.published_at ?? row.candidate_at,
      metadata: asRecord(row.metadata_json),
      recency,
      engagementRaw,
      positiveSim: row.positive_sim,
      negativeSim: row.negative_sim,
    };
  });

  const engagementNorm = normalize01(engagements);

  const wRecency = 0.6;
  const wEngagement = 0.4;

  const scored = base.map((b, idx) => {
    const e = engagementNorm[idx] ?? 0;
    const heuristicScore = wRecency * b.recency + wEngagement * e;
    return { ...b, heuristicScore };
  });

  scored.sort((a, b) => b.heuristicScore - a.heuristicScore || b.candidateAtMs - a.candidateAtMs);

  const triageLimit = resolveTriageLimit({ maxItems, candidateCount: scored.length });
  const triageMap = await triageCandidates({
    db: params.db,
    userId: params.userId,
    candidates: scored,
    windowStart: params.windowStart,
    windowEnd: params.windowEnd,
    mode: params.mode,
    maxCalls: triageLimit,
  });

  const ranked = rankCandidates({
    candidates: scored.map((c) => ({
      candidateId: c.candidateId,
      kind: c.kind,
      representativeContentItemId: c.representativeContentItemId,
      candidateAtMs: c.candidateAtMs,
      heuristicScore: c.heuristicScore,
      positiveSim: c.positiveSim,
      negativeSim: c.negativeSim,
      triage: triageMap.get(c.candidateId) ?? null,
    })),
  });

  const selected = ranked.slice(0, maxItems);

  const byCandidateId = new Map(scored.map((c) => [c.candidateId, c]));
  const tier = resolveBudgetTier(params.mode);
  const enrichCandidates = selected.flatMap((s) => {
    const base = byCandidateId.get(s.candidateId);
    if (!base) return [];
    return [
      {
        candidateId: s.candidateId,
        kind: s.kind,
        representativeContentItemId: base.representativeContentItemId,
        sourceId: base.sourceId,
        sourceType: base.sourceType,
        sourceName: base.sourceName,
        title: base.title,
        bodyText: base.bodyText,
        canonicalUrl: base.canonicalUrl,
        author: base.author,
        publishedAt: base.publishedAt,
        metadata: base.metadata,
        triage: triageMap.get(s.candidateId) ?? null,
      },
    ];
  });

  const { summaries } = await enrichTopCandidates({
    db: params.db,
    userId: params.userId,
    topicId: params.topicId,
    windowStart: params.windowStart,
    windowEnd: params.windowEnd,
    tier,
    candidates: enrichCandidates,
  });

  const items = selected.map((s) => {
    const summary = summaries.get(s.candidateId) ?? null;
    const summaryJson = summary ? (summary as unknown as Record<string, unknown>) : null;
    return s.kind === "cluster"
      ? { clusterId: s.candidateId, contentItemId: null, score: s.score, triageJson: s.triageJson, summaryJson }
      : { clusterId: null, contentItemId: s.candidateId, score: s.score, triageJson: s.triageJson, summaryJson };
  });

  const digest = await params.db.tx(async (tx) => {
    const res = await tx.digests.upsert({
      userId: params.userId,
      topicId: params.topicId,
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
    topicId: params.topicId,
    windowStart: params.windowStart,
    windowEnd: params.windowEnd,
    items: items.length,
  };
}
