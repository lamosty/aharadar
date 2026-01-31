import type { Db } from "@aharadar/db";
import {
  createConfiguredLlmRouter,
  type LlmRuntimeConfig,
  type TriageCandidateInput,
  type TriageOutput,
  triageBatch,
  triageCandidate,
} from "@aharadar/llm";
import {
  type BudgetTier,
  createLogger,
  normalizeHandle,
  parsePersonalizationTuning,
  type SourceType,
} from "@aharadar/shared";

const log = createLogger({ component: "digest" });

/** Default batch size for triage calls (items per LLM request) */
const TRIAGE_BATCH_SIZE = 15;
/** Maximum total input characters per batch (safety limit) */
const TRIAGE_BATCH_MAX_CHARS = 60000;

import { type DiversityCandidate, selectWithDiversity } from "../lib/diversity_selection";
import { type SamplingCandidate, stratifiedSample } from "../lib/fair_sampling";
import { allocateTriageCalls, type TriageCandidate } from "../lib/triage_allocation";
import {
  buildNoveltyFeature,
  getNoveltyLookbackDays,
  type NoveltyFeature,
} from "../scoring/novelty";
import type { IngestSourceFilter } from "./ingest";
import { enrichTopCandidates } from "./llm_enrich";
import {
  computeEffectiveSourceWeight,
  parseSourceTypeWeights,
  rankCandidates,
  type UserPreferences,
} from "./rank";

// catch_up mode removed per task-121; now uses only BudgetTier values
export type DigestMode = BudgetTier;

export interface DigestLimits {
  maxItems: number;
  /** Max triage LLM calls (optional, defaults based on maxItems) */
  triageMaxCalls?: number;
  /** Max candidate pool size (optional, defaults based on maxItems) */
  candidatePoolMax?: number;
}

export interface DigestRunResult {
  digestId: string;
  mode: DigestMode;
  topicId: string;
  windowStart: string;
  windowEnd: string;
  items: number;
  /** Number of items that have triage data (LLM-scored) */
  triaged: number;
  /** Whether paid LLM calls were allowed for this run */
  paidCallsAllowed: boolean;
}

type CandidateRow = {
  kind: "cluster" | "item";
  candidate_id: string;
  candidate_at: string;
  rep_content_item_id: string;
  source_id: string;
  source_type: string;
  source_name: string | null;
  source_config_json: Record<string, unknown> | null;
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
  if (value && typeof value === "object" && !Array.isArray(value))
    return value as Record<string, unknown>;
  return {};
}

function parseXPostsFairnessByAccount(config: Record<string, unknown>): boolean {
  const raw = config.fairnessByAccount ?? config.fairness_by_account;
  return raw === true;
}

function computeFairnessSourceId(params: {
  sourceType: string;
  sourceId: string;
  sourceConfig: Record<string, unknown>;
  author: string | null;
}): string {
  if (params.sourceType !== "x_posts") return params.sourceId;
  if (!parseXPostsFairnessByAccount(params.sourceConfig)) return params.sourceId;
  if (!params.author) return params.sourceId;
  const handle = normalizeHandle(params.author);
  if (!handle) return params.sourceId;
  return `${params.sourceId}::${handle}`;
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

/**
 * Compute novelty for candidates by finding max similarity to topic history.
 *
 * For each candidate with a vector, we query the nearest neighbor from the
 * historical items in the lookback window (topic-scoped, excluding current window).
 *
 * TODO: If this becomes a bottleneck (500 queries × 10ms = 5s), batch with LATERAL:
 *   SELECT cv.candidate_id, nn.max_similarity
 *   FROM (SELECT unnest($ids) as candidate_id, unnest($vectors)::vector as vec) cv
 *   LEFT JOIN LATERAL (
 *     SELECT (1 - (th.vector <=> cv.vec))::float8 as max_similarity
 *     FROM topic_history th ORDER BY th.vector <=> cv.vec LIMIT 1
 *   ) nn ON true
 * Caveat: verify with EXPLAIN ANALYZE that pgvector uses HNSW index per-row.
 */
async function computeNoveltyForCandidates(params: {
  db: Db;
  userId: string;
  topicId: string;
  windowStart: string;
  lookbackDays: number;
  candidates: Array<{ candidateId: string; vectorText: string | null }>;
}): Promise<Map<string, NoveltyFeature>> {
  const noveltyMap = new Map<string, NoveltyFeature>();

  // Filter candidates that have vectors
  const candidatesWithVectors = params.candidates.filter((c) => c.vectorText !== null);
  if (candidatesWithVectors.length === 0) return noveltyMap;

  // Compute lookback window boundary
  const windowStartDate = new Date(params.windowStart);
  const lookbackStartDate = new Date(
    windowStartDate.getTime() - params.lookbackDays * 24 * 60 * 60 * 1000,
  );
  const lookbackStart = lookbackStartDate.toISOString();

  // For each candidate, find the max similarity to any historical embedding
  // We use a single query per candidate (uses pgvector index efficiently)
  for (const candidate of candidatesWithVectors) {
    try {
      // Query: find nearest neighbor in topic history within lookback window
      // Similarity = 1 - cosine_distance
      const result = await params.db.query<{ max_similarity: number }>(
        `with topic_history as (
           select e.vector
           from embeddings e
           join content_items ci on ci.id = e.content_item_id
           join content_item_sources cis on cis.content_item_id = ci.id
           join sources s on s.id = cis.source_id
           where ci.user_id = $1
             and s.topic_id = $2::uuid
             and ci.deleted_at is null
             and ci.duplicate_of_content_item_id is null
             and coalesce(ci.published_at, ci.fetched_at) >= $3::timestamptz
             and coalesce(ci.published_at, ci.fetched_at) < $4::timestamptz
         )
         select (1 - (th.vector <=> $5::vector))::float8 as max_similarity
         from topic_history th
         order by th.vector <=> $5::vector
         limit 1`,
        [params.userId, params.topicId, lookbackStart, params.windowStart, candidate.vectorText],
      );

      const maxSimilarity = result.rows[0]?.max_similarity ?? 0;
      noveltyMap.set(
        candidate.candidateId,
        buildNoveltyFeature({
          lookbackDays: params.lookbackDays,
          maxSimilarity: Math.max(0, Math.min(1, maxSimilarity)),
        }),
      );
    } catch (err) {
      // On error, skip novelty for this candidate (don't break the whole run)
      log.warn(
        {
          candidateId: candidate.candidateId,
          err: err instanceof Error ? err.message : String(err),
        },
        "Novelty query failed for candidate",
      );
    }
  }

  return noveltyMap;
}

// DigestMode is now identical to BudgetTier (catch_up removed)
function resolveBudgetTier(mode: DigestMode): BudgetTier {
  return mode;
}

function resolveTriageLimit(params: {
  maxItems: number;
  candidateCount: number;
  triageMaxCalls?: number;
}): number {
  // Priority: explicit plan limit > env limit > computed default
  const envLimit = parseIntEnv(process.env.OPENAI_TRIAGE_MAX_CALLS_PER_RUN);

  // If plan provides a limit, use it (capped by candidate count)
  if (params.triageMaxCalls !== undefined) {
    return Math.min(params.triageMaxCalls, params.candidateCount);
  }

  // If env provides a limit, use it (capped by candidate count)
  if (envLimit !== null) {
    return Math.max(0, Math.min(envLimit, params.candidateCount));
  }

  // Default: 5x maxItems, capped by candidate count
  const defaultLimit = Math.min(
    params.candidateCount,
    Math.max(params.maxItems, params.maxItems * 5),
  );
  return defaultLimit;
}

function applyCandidateFilterSql(params: {
  filter?: IngestSourceFilter;
  args: unknown[];
  inboxOnly?: boolean;
  userId?: string;
}): {
  /** SQL for filtering sources (in CTEs where only `s` is available) */
  sourceWhereSql: string;
  /** SQL for filtering content items (in queries where `ci` is available) */
  itemWhereSql: string;
  args: unknown[];
} {
  const onlyTypes = (params.filter?.onlySourceTypes ?? []).filter((t) => t.trim().length > 0);
  const onlyIds = (params.filter?.onlySourceIds ?? []).filter((id) => id.trim().length > 0);

  let sourceWhereSql = "";
  let itemWhereSql = "";
  const args = [...params.args];

  if (onlyTypes.length > 0) {
    args.push(onlyTypes);
    sourceWhereSql += ` and s.type = any($${args.length}::text[])`;
  }
  if (onlyIds.length > 0) {
    args.push(onlyIds);
    sourceWhereSql += ` and s.id = any($${args.length}::uuid[])`;
  }

  // Filter out items that have feedback when inboxOnly is true
  // This needs to be applied where `ci` is in scope
  if (params.inboxOnly && params.userId) {
    args.push(params.userId);
    itemWhereSql += ` and not exists (
      select 1 from feedback_events fe
      where fe.content_item_id = ci.id
        and fe.user_id = $${args.length}
        and fe.action in ('like', 'dislike')
    )`;
  }

  return { sourceWhereSql, itemWhereSql, args };
}

interface TriageableCandidate {
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
}

function chunkCandidatesIntoBatches(
  candidates: TriageableCandidate[],
  batchSize: number,
  maxChars: number,
): TriageableCandidate[][] {
  const batches: TriageableCandidate[][] = [];
  let currentBatch: TriageableCandidate[] = [];
  let currentChars = 0;

  for (const candidate of candidates) {
    const itemChars = (candidate.title?.length ?? 0) + (candidate.bodyText?.length ?? 0);

    // Start new batch if current would exceed limits
    if (
      currentBatch.length >= batchSize ||
      (currentChars + itemChars > maxChars && currentBatch.length > 0)
    ) {
      batches.push(currentBatch);
      currentBatch = [];
      currentChars = 0;
    }

    currentBatch.push(candidate);
    currentChars += itemChars;
  }

  // Push final batch if not empty
  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  return batches;
}

async function triageCandidates(params: {
  db: Db;
  userId: string;
  candidates: TriageableCandidate[];
  windowStart: string;
  windowEnd: string;
  mode: DigestMode;
  maxCalls: number;
  llmConfig?: LlmRuntimeConfig;
}): Promise<Map<string, TriageOutput>> {
  if (params.maxCalls <= 0 || params.candidates.length === 0) return new Map();

  let router: ReturnType<typeof createConfiguredLlmRouter> | null = null;
  try {
    router = createConfiguredLlmRouter(process.env, params.llmConfig);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn({ err: message }, "LLM triage disabled");
    return new Map();
  }
  if (!router) return new Map();

  const tier = resolveBudgetTier(params.mode);
  const triageMap = new Map<string, TriageOutput>();

  // Take only up to maxCalls candidates (this is the allocation limit)
  const candidatesToTriage = params.candidates.slice(0, params.maxCalls);

  // Check if batching is enabled: llmConfig > env > default (true)
  const batchEnabled =
    params.llmConfig?.triageBatchEnabled ?? process.env.TRIAGE_BATCH_ENABLED !== "false";
  const batchSize =
    params.llmConfig?.triageBatchSize ??
    (parseInt(process.env.TRIAGE_BATCH_SIZE ?? "", 10) || TRIAGE_BATCH_SIZE);
  const maxChars = parseInt(process.env.TRIAGE_BATCH_MAX_CHARS ?? "", 10) || TRIAGE_BATCH_MAX_CHARS;

  if (!batchEnabled) {
    // Fall back to individual triage (original behavior)
    return triageCandidatesIndividually({
      ...params,
      candidates: candidatesToTriage,
      router,
      tier,
      triageMap,
    });
  }

  // Chunk candidates into batches
  const batches = chunkCandidatesIntoBatches(candidatesToTriage, batchSize, maxChars);
  log.info(
    { totalCandidates: candidatesToTriage.length, batchCount: batches.length, batchSize },
    "Starting batch triage",
  );

  for (const [batchIndex, batch] of batches.entries()) {
    const batchId = `batch-${batchIndex}`;
    const ref = router.chooseModel("triage", tier);
    const startedAt = new Date().toISOString();

    // Convert to TriageCandidateInput format
    const batchInputs: TriageCandidateInput[] = batch.map((c) => ({
      id: c.candidateId,
      title: c.title,
      bodyText: c.bodyText,
      sourceType: c.sourceType,
      sourceName: c.sourceName,
      primaryUrl: getPrimaryUrl({ canonicalUrl: c.canonicalUrl, metadata: c.metadata }),
      author: c.author,
      publishedAt: c.publishedAt,
      windowStart: params.windowStart,
      windowEnd: params.windowEnd,
    }));

    try {
      const result = await triageBatch({
        router,
        tier,
        candidates: batchInputs,
        batchId,
        reasoningEffortOverride: params.llmConfig?.reasoningEffort,
      });

      // Merge results into triageMap
      for (const [id, output] of result.outputs) {
        triageMap.set(id, output);
      }

      const endedAt = new Date().toISOString();

      // Record batch call in provider_calls
      try {
        await params.db.providerCalls.insert({
          userId: params.userId,
          purpose: "triage_batch",
          provider: result.provider,
          model: result.model,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          costEstimateCredits: result.costEstimateCredits,
          meta: {
            batchId,
            batchIndex,
            itemCount: result.itemCount,
            successCount: result.successCount,
            candidateIds: batch.map((c) => c.candidateId),
            windowStart: params.windowStart,
            windowEnd: params.windowEnd,
            endpoint: result.endpoint,
          },
          startedAt,
          endedAt,
          status: "ok",
        });
      } catch (err) {
        log.warn({ err }, "provider_calls insert failed (triage_batch)");
      }

      // Check for partial failures - items in batch but not in results
      const missingIds = batch.map((c) => c.candidateId).filter((id) => !result.outputs.has(id));

      if (missingIds.length > 0) {
        log.warn(
          { batchId, missingCount: missingIds.length, missingIds },
          "Batch had missing results, retrying individually",
        );

        // Retry missing items individually
        const missingCandidates = batch.filter((c) => missingIds.includes(c.candidateId));
        const individualResults = await triageCandidatesIndividually({
          db: params.db,
          userId: params.userId,
          candidates: missingCandidates,
          windowStart: params.windowStart,
          windowEnd: params.windowEnd,
          mode: params.mode,
          maxCalls: missingCandidates.length,
          llmConfig: params.llmConfig,
          router,
          tier,
          triageMap: new Map(),
        });

        for (const [id, output] of individualResults) {
          triageMap.set(id, output);
        }
      }

      log.info(
        { batchId, inputCount: batch.length, outputCount: result.outputs.size },
        "Batch triage complete",
      );
    } catch (err) {
      const endedAt = new Date().toISOString();

      // Record failed batch
      try {
        await params.db.providerCalls.insert({
          userId: params.userId,
          purpose: "triage_batch",
          provider: ref.provider,
          model: ref.model,
          inputTokens: 0,
          outputTokens: 0,
          costEstimateCredits: 0,
          meta: {
            batchId,
            batchIndex,
            itemCount: batch.length,
            candidateIds: batch.map((c) => c.candidateId),
            windowStart: params.windowStart,
            windowEnd: params.windowEnd,
            endpoint: ref.endpoint,
          },
          startedAt,
          endedAt,
          status: "error",
          error: {
            message: err instanceof Error ? err.message : String(err),
          },
        });
      } catch (insertErr) {
        log.warn({ err: insertErr }, "provider_calls insert failed (triage_batch error)");
      }

      log.warn(
        { batchId, err: err instanceof Error ? err.message : String(err) },
        "Batch triage failed, falling back to individual",
      );

      // Fall back to individual triage for this batch
      const individualResults = await triageCandidatesIndividually({
        db: params.db,
        userId: params.userId,
        candidates: batch,
        windowStart: params.windowStart,
        windowEnd: params.windowEnd,
        mode: params.mode,
        maxCalls: batch.length,
        llmConfig: params.llmConfig,
        router,
        tier,
        triageMap: new Map(),
      });

      for (const [id, output] of individualResults) {
        triageMap.set(id, output);
      }
    }
  }

  log.info(
    { totalTriaged: triageMap.size, totalCandidates: candidatesToTriage.length },
    "Batch triage processing complete",
  );

  return triageMap;
}

async function triageCandidatesIndividually(params: {
  db: Db;
  userId: string;
  candidates: TriageableCandidate[];
  windowStart: string;
  windowEnd: string;
  mode: DigestMode;
  maxCalls: number;
  llmConfig?: LlmRuntimeConfig;
  router: ReturnType<typeof createConfiguredLlmRouter>;
  tier: BudgetTier;
  triageMap: Map<string, TriageOutput>;
}): Promise<Map<string, TriageOutput>> {
  const triageMap = params.triageMap;

  for (const candidate of params.candidates.slice(0, params.maxCalls)) {
    const ref = params.router.chooseModel("triage", params.tier);
    const startedAt = new Date().toISOString();
    try {
      const result = await triageCandidate({
        router: params.router,
        tier: params.tier,
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
        reasoningEffortOverride: params.llmConfig?.reasoningEffort,
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
        log.warn({ err }, "provider_calls insert failed (triage)");
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
      } catch (insertErr) {
        log.warn({ err: insertErr }, "provider_calls insert failed (triage error)");
      }

      log.warn(
        {
          candidateId: candidate.candidateId,
          err: err instanceof Error ? err.message : String(err),
        },
        "Triage failed for candidate",
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
  /** If false, skip LLM triage (heuristic-only scoring; triage_json stays null) */
  paidCallsAllowed?: boolean;
  /** Optional runtime LLM configuration (overrides env vars) */
  llmConfig?: LlmRuntimeConfig;
  /** Source results from ingest stage (for observability) */
  sourceResults?: Array<{
    sourceId: string;
    sourceName: string;
    sourceType: string;
    status: "ok" | "partial" | "error" | "skipped";
    skipReason?: string;
    itemsFetched: number;
  }>;
  /** If true, skip items that already have feedback (liked/disliked) */
  inboxOnly?: boolean;
}): Promise<DigestRunResult | null> {
  // Track when this digest run starts for cost aggregation
  const runStartedAt = new Date();

  const paidCallsAllowed = params.paidCallsAllowed ?? true;
  const maxItems = params.limits?.maxItems ?? 20;
  const triageMaxCalls = params.limits?.triageMaxCalls;

  // Use plan's candidatePoolMax if provided, otherwise compute default
  const candidatePoolSize =
    params.limits?.candidatePoolMax ?? Math.min(500, Math.max(maxItems, maxItems * 10));

  const baseArgs: unknown[] = [
    params.userId,
    params.topicId,
    params.windowStart,
    params.windowEnd,
    candidatePoolSize,
  ];
  const filtered = applyCandidateFilterSql({
    filter: params.filter,
    args: baseArgs,
    inboxOnly: params.inboxOnly,
    userId: params.userId,
  });

  const candidates = await params.db.query<CandidateRow>(
    `with topic_membership as (
       select distinct cis.content_item_id
       from content_item_sources cis
       join sources s on s.id = cis.source_id
       where s.user_id = $1
         and s.topic_id = $2::uuid
         ${filtered.sourceWhereSql}
     ),
     topic_item_source as (
       select distinct on (cis.content_item_id)
         cis.content_item_id,
         cis.source_id
       from content_item_sources cis
       join sources s on s.id = cis.source_id
       where s.user_id = $1
         and s.topic_id = $2::uuid
         ${filtered.sourceWhereSql}
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
         ${filtered.itemWhereSql}
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
         s.config_json as source_config_json,
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
         order by
           (case when ci.title is not null then 0 else 1 end) asc,
           (case when ci.source_type != 'x_posts' and ci.canonical_url is not null then 0 else 1 end) asc,
           length(coalesce(ci.body_text, '')) desc,
           (case when ci.canonical_url is not null then 0 else 1 end) asc,
           coalesce(ci.published_at, ci.fetched_at) desc,
           ci.id asc
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
         s.config_json as source_config_json,
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
     -- Fair sampling: order by engagement + title presence, NOT purely by recency
     -- This ensures high-volume sources don't starve quieter sources
     order by
       (case when u.title is not null and length(coalesce(u.title, '')) > 5 then 0 else 1 end) asc,
       greatest(
         coalesce((u.metadata_json->>'score')::numeric, 0),
         coalesce((u.metadata_json->>'likes')::numeric, 0),
         coalesce((u.metadata_json->>'ups')::numeric, 0),
         0
       ) desc,
       u.candidate_at desc
     limit $5`,
    filtered.args,
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
    const sourceConfigJson = asRecord(row.source_config_json);
    const fairnessSourceId = computeFairnessSourceId({
      sourceType: row.source_type,
      sourceId: row.source_id,
      sourceConfig: sourceConfigJson,
      author: row.author,
    });
    const engagementRaw = getEngagementRaw(meta);
    recencies.push(recency);
    engagements.push(engagementRaw);
    return {
      candidateId: row.candidate_id,
      kind: row.kind,
      representativeContentItemId: row.rep_content_item_id,
      candidateAtMs: tMs,
      sourceId: row.source_id,
      fairnessSourceId,
      sourceType: row.source_type,
      sourceName: row.source_name,
      sourceConfigJson,
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
      vectorText: row.vector_text,
    };
  });

  const engagementNorm = normalize01(engagements);

  const wRecency = 0.6;
  const wEngagement = 0.4;

  const scored = base.map((b, idx) => {
    const e = engagementNorm[idx] ?? 0;
    const heuristicScore = wRecency * b.recency + wEngagement * e;
    return { ...b, heuristicScore, engagement01: e };
  });

  scored.sort((a, b) => b.heuristicScore - a.heuristicScore || b.candidateAtMs - a.candidateAtMs);

  // Policy=STOP: when paid calls are not allowed, skip digest creation entirely
  // This ensures we don't create low-quality digests without triage
  if (!paidCallsAllowed) {
    log.info(
      {
        topicId: params.topicId.slice(0, 8),
        windowStart: params.windowStart,
        windowEnd: params.windowEnd,
        candidateCount: scored.length,
      },
      "Skipping digest creation: paidCallsAllowed=false (policy=stop)",
    );
    return null;
  }

  // =========================================================================
  // Load topic and parse personalization tuning settings
  // =========================================================================
  const topic = await params.db.topics.getById(params.topicId);
  const tuning = parsePersonalizationTuning(topic?.custom_settings?.personalization_tuning_v1);

  log.debug(
    {
      prefBiasSampling: tuning.prefBiasSamplingWeight,
      prefBiasTriage: tuning.prefBiasTriageWeight,
      rankPrefWeight: tuning.rankPrefWeight,
      feedbackDelta: tuning.feedbackWeightDelta,
    },
    "Effective personalization tuning",
  );

  // Helper to compute preference score from embedding similarity
  // preferenceScore = clamp(-1, 1, positiveSim - negativeSim)
  const computePreferenceScore = (
    positiveSim: number | null,
    negativeSim: number | null,
  ): number => {
    const raw = (positiveSim ?? 0) - (negativeSim ?? 0);
    return Math.max(-1, Math.min(1, raw));
  };

  // =========================================================================
  // Step 1: Stratified sampling for fair coverage across sources and time
  // =========================================================================
  const samplingCandidates: SamplingCandidate[] = scored.map((c) => ({
    candidateId: c.candidateId,
    sourceType: c.sourceType,
    sourceId: c.fairnessSourceId,
    candidateAtMs: c.candidateAtMs,
    heuristicScore: c.heuristicScore,
    preferenceScore: computePreferenceScore(c.positiveSim, c.negativeSim),
  }));

  const samplingResult = stratifiedSample({
    candidates: samplingCandidates,
    windowStartMs,
    windowEndMs,
    maxPoolSize: candidatePoolSize,
    preferenceBiasWeight: tuning.prefBiasSamplingWeight,
  });

  // Filter to only sampled candidates
  const sampledScored = scored.filter((c) => samplingResult.sampledIds.has(c.candidateId));

  log.info(
    {
      input: samplingResult.stats.inputCount,
      output: samplingResult.stats.outputCount,
      buckets: samplingResult.stats.bucketCount,
      sourceTypes: samplingResult.stats.sourceTypeCount,
      sources: samplingResult.stats.sourceCount,
      topTypes: samplingResult.stats.topSourceTypes.slice(0, 3),
    },
    "Stratified sampling completed",
  );

  // =========================================================================
  // Step 2: Triage allocation with exploration + exploitation phases
  // =========================================================================
  const triageLimit = resolveTriageLimit({
    maxItems,
    candidateCount: sampledScored.length,
    triageMaxCalls,
  });

  // Build triage candidates for allocation
  const triageCandidatesForAlloc: TriageCandidate[] = sampledScored.map((c) => ({
    candidateId: c.candidateId,
    sourceType: c.sourceType,
    sourceId: c.fairnessSourceId,
    heuristicScore: c.heuristicScore,
    preferenceScore: computePreferenceScore(c.positiveSim, c.negativeSim),
  }));

  const triageAllocation = allocateTriageCalls({
    candidates: triageCandidatesForAlloc,
    maxTriageCalls: triageLimit,
    preferenceBiasWeight: tuning.prefBiasTriageWeight,
  });

  log.info(
    {
      exploration: triageAllocation.stats.explorationSlots,
      exploitation: triageAllocation.stats.exploitationSlots,
      explorationSources: triageAllocation.stats.explorationSourceCount,
      byType: triageAllocation.stats.explorationByType.slice(0, 3),
    },
    "Triage allocation completed",
  );

  // Build lookup for quick access
  const sampledScoredMap = new Map(sampledScored.map((c) => [c.candidateId, c]));

  // Reorder candidates for triage according to allocation order
  const orderedForTriage = triageAllocation.triageOrder
    .map((id) => sampledScoredMap.get(id))
    .filter((c): c is NonNullable<typeof c> => c !== undefined);

  // Perform triage on ordered candidates
  const triageMap = await triageCandidates({
    db: params.db,
    userId: params.userId,
    candidates: orderedForTriage,
    windowStart: params.windowStart,
    windowEnd: params.windowEnd,
    mode: params.mode,
    maxCalls: triageLimit,
    llmConfig: params.llmConfig,
  });

  // Compute novelty for candidates (topic-scoped, embedding-based)
  const noveltyLookbackDays = getNoveltyLookbackDays();
  const noveltyMap = await computeNoveltyForCandidates({
    db: params.db,
    userId: params.userId,
    topicId: params.topicId,
    windowStart: params.windowStart,
    lookbackDays: noveltyLookbackDays,
    candidates: scored.map((c) => ({ candidateId: c.candidateId, vectorText: c.vectorText })),
  });

  // Parse source type weights from env for ranking
  const sourceTypeWeights = parseSourceTypeWeights();

  // Compute user preferences from feedback history (source/author weights)
  const feedbackPrefs = await params.db.feedbackEvents.computeUserPreferences({
    userId: params.userId,
    maxFeedbackAgeDays: 90, // Use last 90 days of feedback
    weightDelta: tuning.feedbackWeightDelta,
  });
  const userPreferences: UserPreferences = {
    sourceTypeWeights: feedbackPrefs.sourceTypeWeights,
    authorWeights: feedbackPrefs.authorWeights,
  };

  // Topic is already fetched earlier for tuning settings
  const topicDecayHours = topic?.decay_hours ?? null;

  const ranked = rankCandidates({
    userPreferences,
    decayHours: topicDecayHours,
    weights: { wPref: tuning.rankPrefWeight },
    candidates: scored.map((c) => {
      // Compute source weight (from source config and env type weights)
      const perSourceWeight = asFiniteNumber(c.sourceConfigJson?.weight);
      const sourceWeight = computeEffectiveSourceWeight({
        sourceType: c.sourceType,
        sourceName: c.sourceName,
        sourceWeight: perSourceWeight,
        typeWeights: sourceTypeWeights,
      });

      return {
        candidateId: c.candidateId,
        kind: c.kind,
        representativeContentItemId: c.representativeContentItemId,
        candidateAtMs: c.candidateAtMs,
        heuristicScore: c.heuristicScore,
        recency01: c.recency,
        engagement01: c.engagement01,
        positiveSim: c.positiveSim,
        negativeSim: c.negativeSim,
        triage: triageMap.get(c.candidateId) ?? null,
        signalCorroboration: null,
        novelty: noveltyMap.get(c.candidateId) ?? null,
        sourceWeight,
        sourceType: c.sourceType as SourceType,
        author: c.author,
      };
    }),
  });

  // =========================================================================
  // Step 4: Diversity selection with soft penalties
  // Only selects from triaged candidates when paidCallsAllowed=true (checked above)
  // =========================================================================
  const diversityCandidates: DiversityCandidate[] = ranked.map((r) => {
    const baseCandidate = sampledScoredMap.get(r.candidateId);
    return {
      candidateId: r.candidateId,
      score: r.score,
      sourceType: baseCandidate?.sourceType ?? "unknown",
      sourceId: baseCandidate?.sourceId ?? "unknown",
      author: baseCandidate?.author ?? null,
      // For clusters, member sources would be added here in a future enhancement
      // memberSources: undefined, // TODO: load cluster member sources for better diversity
      hasTriageData: r.triageJson !== null,
    };
  });

  const diversityResult = selectWithDiversity({
    candidates: diversityCandidates,
    maxItems,
    requireTriageData: true, // Always require triage data (paidCallsAllowed is already checked)
  });

  // Map selected IDs back to ranked candidates
  const selectedIdSet = new Set(diversityResult.selectedIds);
  const selected = ranked.filter((r) => selectedIdSet.has(r.candidateId));

  // Log diversity selection stats
  if (diversityResult.stats.limitedByTriageData) {
    log.warn(
      {
        requested: maxItems,
        selected: selected.length,
        triagedAvailable: diversityResult.stats.triagedInputCount,
      },
      "Digest shrunk due to limited triage data",
    );
  }

  log.info(
    {
      input: diversityResult.stats.inputCount,
      output: diversityResult.stats.outputCount,
      triaged: diversityResult.stats.triagedInputCount,
      byType: diversityResult.stats.outputByType.slice(0, 3),
      topSources: diversityResult.stats.outputBySource.slice(0, 3).map((s) => ({
        id: s.sourceId.slice(0, 8),
        type: s.sourceType,
        count: s.count,
      })),
      topAuthors: diversityResult.stats.outputByAuthor.slice(0, 5),
    },
    "Diversity selection completed",
  );

  const byCandidateId = new Map(sampledScored.map((c) => [c.candidateId, c]));
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
      ? {
          clusterId: s.candidateId,
          contentItemId: null,
          ahaScore: s.score,
          triageJson: s.triageJson,
          summaryJson,
        }
      : {
          clusterId: null,
          contentItemId: s.candidateId,
          ahaScore: s.score,
          triageJson: s.triageJson,
          summaryJson,
        };
  });

  // Sum LLM costs incurred during this digest run (triage + deep_summary)
  const runCosts = await params.db.providerCalls.getDigestRunCosts(params.userId, runStartedAt);

  const digest = await params.db.tx(async (tx) => {
    const res = await tx.digests.upsert({
      userId: params.userId,
      topicId: params.topicId,
      windowStart: params.windowStart,
      windowEnd: params.windowEnd,
      mode: params.mode,
      status: "complete",
      creditsUsed: runCosts.totalUsd,
      sourceResults: params.sourceResults ?? [],
    });
    await tx.digestItems.replaceForDigest({ digestId: res.id, items });
    return res;
  });

  const triagedCount = items.filter((i) => i.triageJson !== null).length;

  // Final summary log (all items should be triaged since paidCallsAllowed is checked earlier)
  log.info(
    {
      digestId: digest.id.slice(0, 8),
      topicId: params.topicId.slice(0, 8),
      candidatePool: samplingResult.stats.inputCount,
      sampled: samplingResult.stats.outputCount,
      triaged: triagedCount,
      digestItems: items.length,
      byType: diversityResult.stats.outputByType.slice(0, 3),
    },
    "Digest run completed",
  );

  return {
    digestId: digest.id,
    mode: params.mode,
    topicId: params.topicId,
    windowStart: params.windowStart,
    windowEnd: params.windowEnd,
    items: items.length,
    triaged: triagedCount,
    paidCallsAllowed,
  };
}
