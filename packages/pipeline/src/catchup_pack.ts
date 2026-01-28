import crypto from "node:crypto";

import type { Db, UserPreferences } from "@aharadar/db";
import {
  catchupPackSelect,
  catchupPackTier,
  createConfiguredLlmRouter,
  type LlmRuntimeConfig,
} from "@aharadar/llm";
import {
  type BudgetTier,
  type CatchupPack,
  type CatchupPackOutput,
  type CatchupPackTierItem,
  computeCatchupPackHash,
  createLogger,
} from "@aharadar/shared";

const log = createLogger({ component: "catchup_pack" });

type CandidateRow = {
  content_item_id: string;
  aha_score: number | null;
  triage_json: Record<string, unknown> | null;
  digest_created_at: string;
  title: string | null;
  body_text: string | null;
  canonical_url: string | null;
  author: string | null;
  published_at: string | null;
  source_type: string;
  source_id: string;
  metadata_json: Record<string, unknown> | null;
  feedback_action: string | null;
  read_at: string | null;
};

type ScoredCandidate = {
  itemId: string;
  title: string | null;
  bodyText: string | null;
  triageReason: string | null;
  aiScore: number | null;
  ahaScore01: number;
  sourceType: string;
  sourceId: string;
  author: string | null;
  publishedAt: string | null;
  candidateAt: Date;
  score: number;
  tieBreaker: string;
};

type PackTargets = {
  poolTarget: number;
  tierTargets: {
    must_read: number;
    worth_scanning: number;
    headlines: number;
  };
  chunkSize: number;
};

const TIME_BUDGETS = new Set([30, 45, 60, 90]);

function parseIntEnv(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function clampText(value: string | null | undefined, maxChars: number): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length <= maxChars) return trimmed;
  return trimmed.slice(0, maxChars);
}

function getPackTargets(timeBudgetMinutes: number): PackTargets {
  switch (timeBudgetMinutes) {
    case 30:
      return {
        poolTarget: 200,
        tierTargets: { must_read: 10, worth_scanning: 15, headlines: 20 },
        chunkSize: 50,
      };
    case 45:
      return {
        poolTarget: 300,
        tierTargets: { must_read: 12, worth_scanning: 20, headlines: 30 },
        chunkSize: 50,
      };
    case 60:
      return {
        poolTarget: 420,
        tierTargets: { must_read: 15, worth_scanning: 25, headlines: 40 },
        chunkSize: 55,
      };
    case 90:
      return {
        poolTarget: 600,
        tierTargets: { must_read: 20, worth_scanning: 35, headlines: 60 },
        chunkSize: 60,
      };
    default:
      return {
        poolTarget: 300,
        tierTargets: { must_read: 12, worth_scanning: 20, headlines: 30 },
        chunkSize: 50,
      };
  }
}

function hashTieBreaker(scopeHash: string, itemId: string): string {
  return crypto.createHash("sha256").update(`${scopeHash}:${itemId}`).digest("hex");
}

/**
 * Calculate adaptive pool size based on tier targets and available candidates.
 * Ensures pool is large enough for selection diversity but not wastefully large.
 */
function calculateAdaptivePoolSize(params: {
  tierTargets: PackTargets["tierTargets"];
  candidateCount: number;
}): number {
  const { tierTargets, candidateCount } = params;
  const totalTierItems = tierTargets.must_read + tierTargets.worth_scanning + tierTargets.headlines;

  const minPool = totalTierItems * 2; // Need at least 2x for selection
  const idealPool = totalTierItems * 4; // 4x gives good diversity
  const maxPool = 600;

  return Math.min(maxPool, Math.max(minPool, Math.min(idealPool, candidateCount)));
}

function toScore01(value: number | null): number {
  if (value === null || !Number.isFinite(value)) return 0;
  if (value > 1) return Math.max(0, Math.min(1, value / 100));
  return Math.max(0, Math.min(1, value));
}

function computeRecency01(candidateAt: Date, windowStart: Date, windowEnd: Date): number {
  const totalMs = windowEnd.getTime() - windowStart.getTime();
  if (totalMs <= 0) return 0;
  const ageMs = windowEnd.getTime() - candidateAt.getTime();
  const recency = 1 - ageMs / totalMs;
  return Math.max(0, Math.min(1, recency));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Compute a preference score [0, 1] for a candidate based on user preferences.
 * Uses sourceTypeWeights and authorWeights from feedback history.
 */
function computePreferenceScore(
  sourceType: string,
  author: string | null,
  preferences: UserPreferences,
): number {
  // Weights are in [0.5, 2.0] range, neutral is 1.0
  // Convert to boost: weight - 1.0 gives range [-0.5, 1.0]
  const sourceTypeWeight =
    preferences.sourceTypeWeights[sourceType as keyof typeof preferences.sourceTypeWeights] ?? 1.0;
  const sourceTypeBoost = sourceTypeWeight - 1.0;

  let authorBoost = 0;
  if (author && preferences.authorWeights[author] !== undefined) {
    authorBoost = preferences.authorWeights[author] - 1.0;
  }

  // Combine boosts and normalize to [0, 1]
  // Average boost range is [-0.5, 1.0], normalize by adding 0.5 and scaling
  const combinedBoost = (sourceTypeBoost + authorBoost) / 2;
  return clamp01(combinedBoost + 0.5);
}

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}

type DiversityCaps = {
  maxPerSourceType: number;
  maxPerSource: number;
  maxPerAuthor: number;
};

type DiversityCounts = {
  sourceType: Map<string, number>;
  sourceId: Map<string, number>;
  author: Map<string, number>;
};

function initCounts(): DiversityCounts {
  return {
    sourceType: new Map(),
    sourceId: new Map(),
    author: new Map(),
  };
}

function canInclude(
  candidate: ScoredCandidate,
  caps: DiversityCaps,
  counts: DiversityCounts,
): boolean {
  const sourceTypeCount = counts.sourceType.get(candidate.sourceType) ?? 0;
  if (sourceTypeCount >= caps.maxPerSourceType) return false;

  const sourceIdCount = counts.sourceId.get(candidate.sourceId) ?? 0;
  if (sourceIdCount >= caps.maxPerSource) return false;

  if (candidate.author) {
    const authorCount = counts.author.get(candidate.author) ?? 0;
    if (authorCount >= caps.maxPerAuthor) return false;
  }

  return true;
}

function bumpCounts(candidate: ScoredCandidate, counts: DiversityCounts): void {
  counts.sourceType.set(
    candidate.sourceType,
    (counts.sourceType.get(candidate.sourceType) ?? 0) + 1,
  );
  counts.sourceId.set(candidate.sourceId, (counts.sourceId.get(candidate.sourceId) ?? 0) + 1);
  if (candidate.author) {
    counts.author.set(candidate.author, (counts.author.get(candidate.author) ?? 0) + 1);
  }
}

function selectWithCaps(
  candidates: ScoredCandidate[],
  target: number,
  caps: DiversityCaps,
  counts: DiversityCounts,
): ScoredCandidate[] {
  const selected: ScoredCandidate[] = [];
  for (const candidate of candidates) {
    if (selected.length >= target) break;
    if (!canInclude(candidate, caps, counts)) continue;
    selected.push(candidate);
    bumpCounts(candidate, counts);
  }
  return selected;
}

function selectPool(params: { candidates: ScoredCandidate[]; poolTarget: number }): {
  pool: ScoredCandidate[];
  stats: Record<string, unknown>;
} {
  const { candidates, poolTarget } = params;
  const explorationCount = Math.max(0, Math.round(poolTarget * 0.12));
  const mainTarget = Math.max(0, poolTarget - explorationCount);

  const caps: DiversityCaps = {
    maxPerSourceType: Math.max(6, Math.round(poolTarget * 0.4)),
    maxPerSource: Math.max(4, Math.round(poolTarget * 0.12)),
    maxPerAuthor: 3,
  };

  const counts = initCounts();
  const sorted = [...candidates].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.tieBreaker.localeCompare(b.tieBreaker);
  });

  const main = selectWithCaps(sorted, mainTarget, caps, counts);
  const mainIds = new Set(main.map((c) => c.itemId));
  const remaining = sorted.filter((c) => !mainIds.has(c.itemId));

  const explorationSorted = [...remaining].sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    return a.tieBreaker.localeCompare(b.tieBreaker);
  });
  const exploration = selectWithCaps(explorationSorted, explorationCount, caps, counts);
  const explorationIds = new Set(exploration.map((c) => c.itemId));
  const stillRemaining = remaining.filter((c) => !explorationIds.has(c.itemId));

  let pool = [...main, ...exploration];
  if (pool.length < poolTarget && stillRemaining.length > 0) {
    const fill = stillRemaining.slice(0, poolTarget - pool.length);
    pool = [...pool, ...fill];
  }

  return {
    pool,
    stats: {
      poolTarget,
      poolActual: pool.length,
      explorationCount,
      mainCount: main.length,
      explorationActual: exploration.length,
      caps,
    },
  };
}

function toTieredInput(
  candidate: ScoredCandidate,
  maxSnippet: number,
): {
  item_id: string;
  title: string | null;
  body_snippet: string | null;
  triage_reason: string | null;
  ai_score: number | null;
  aha_score: number;
  source_type: string;
  author: string | null;
  published_at: string | null;
} {
  return {
    item_id: candidate.itemId,
    title: candidate.title,
    body_snippet: clampText(candidate.bodyText, maxSnippet),
    triage_reason: candidate.triageReason,
    ai_score: candidate.aiScore,
    aha_score: candidate.ahaScore01,
    source_type: candidate.sourceType,
    author: candidate.author,
    published_at: candidate.publishedAt,
  };
}

function dedupeAndTrimTiers(
  output: CatchupPackOutput,
  allowedIds: Set<string>,
  targets: PackTargets["tierTargets"],
): CatchupPackOutput["tiers"] {
  const seen = new Set<string>();
  const filterTier = (items: CatchupPackTierItem[], maxCount: number) => {
    const out: CatchupPackTierItem[] = [];
    for (const item of items) {
      if (out.length >= maxCount) break;
      if (!allowedIds.has(item.item_id)) continue;
      if (seen.has(item.item_id)) continue;
      seen.add(item.item_id);
      out.push(item);
    }
    return out;
  };

  return {
    must_read: filterTier(output.tiers.must_read, targets.must_read),
    worth_scanning: filterTier(output.tiers.worth_scanning, targets.worth_scanning),
    headlines: filterTier(output.tiers.headlines, targets.headlines),
  };
}

function filterThemes(
  themes: CatchupPackOutput["themes"],
  allowedIds: Set<string>,
): CatchupPackOutput["themes"] {
  const filtered: CatchupPackOutput["themes"] = [];
  for (const theme of themes) {
    const itemIds = theme.item_ids.filter((id) => allowedIds.has(id));
    if (itemIds.length === 0) continue;
    filtered.push({ ...theme, item_ids: itemIds });
  }
  return filtered.length > 0 ? filtered : [];
}

async function fetchCandidates(params: {
  db: Db;
  userId: string;
  topicId: string;
  since: string;
  until: string;
}): Promise<CandidateRow[]> {
  const res = await params.db.query<CandidateRow>(
    `with latest_items as (
       select distinct on (coalesce(di.content_item_id, c.representative_content_item_id))
         coalesce(di.content_item_id, c.representative_content_item_id) as content_item_id,
         di.aha_score,
         di.triage_json,
         d.created_at as digest_created_at,
         d.topic_id as digest_topic_id
       from digest_items di
       join digests d on d.id = di.digest_id
       left join clusters c on c.id = di.cluster_id
       join content_items ci_inner on ci_inner.id = coalesce(di.content_item_id, c.representative_content_item_id)
       where d.user_id = $1
         and d.topic_id = $2
       order by coalesce(di.content_item_id, c.representative_content_item_id), d.created_at desc
     )
     select
       li.content_item_id::text as content_item_id,
       li.aha_score,
       li.triage_json,
       li.digest_created_at::text as digest_created_at,
       ci.title,
       ci.body_text,
       ci.canonical_url,
       ci.author,
       ci.published_at::text as published_at,
       s.type as source_type,
       s.id::text as source_id,
       ci.metadata_json,
       fe.action as feedback_action,
       ir.read_at::text as read_at
     from latest_items li
     join content_items ci on ci.id = li.content_item_id
     join lateral (
       select s.id, s.type
       from content_item_sources cis
       join sources s on s.id = cis.source_id
       where cis.content_item_id = ci.id
         and s.topic_id = $2
       order by s.created_at asc
       limit 1
     ) s on true
     left join lateral (
       select action from feedback_events
       where user_id = $1 and content_item_id = li.content_item_id
       order by created_at desc
       limit 1
     ) fe on true
     left join content_item_reads ir
       on ir.user_id = $1 and ir.content_item_id = li.content_item_id
     where ci.deleted_at is null
       and ci.source_type != 'signal'
       and coalesce(ci.published_at, li.digest_created_at) >= $3::timestamptz
       and coalesce(ci.published_at, li.digest_created_at) <= $4::timestamptz`,
    [params.userId, params.topicId, params.since, params.until],
  );

  return res.rows;
}

export async function generateCatchupPack(params: {
  db: Db;
  userId: string;
  topicId: string;
  since: string;
  until: string;
  timeBudgetMinutes: number;
  tier?: BudgetTier;
  llmConfig?: LlmRuntimeConfig;
}): Promise<CatchupPack> {
  if (!TIME_BUDGETS.has(params.timeBudgetMinutes)) {
    throw new Error(`Unsupported time budget: ${params.timeBudgetMinutes}`);
  }

  const scopeHash = computeCatchupPackHash({
    type: "range",
    topicId: params.topicId,
    since: params.since,
    until: params.until,
    timeBudgetMinutes: params.timeBudgetMinutes,
  });

  const existing = await params.db.catchupPacks.getByScope({
    userId: params.userId,
    scopeHash,
  });

  if (existing && existing.status === "complete") {
    return existing;
  }

  const startTime = Date.now();

  await params.db.catchupPacks.upsert({
    userId: params.userId,
    topicId: params.topicId,
    scopeType: "range",
    scopeHash,
    status: "pending",
    metaJson: {
      scope: {
        since: params.since,
        until: params.until,
        timeBudgetMinutes: params.timeBudgetMinutes,
      },
    },
  });

  try {
    const candidates = await fetchCandidates({
      db: params.db,
      userId: params.userId,
      topicId: params.topicId,
      since: params.since,
      until: params.until,
    });

    // Get items shown in recent packs for novelty deduplication
    const recentlyShownIds = await params.db.catchupPacks.getRecentPackItemIds({
      userId: params.userId,
      topicId: params.topicId,
      withinDays: 14,
    });

    const filtered = candidates.filter((row) => {
      // Exclude items that appeared in recent packs
      if (recentlyShownIds.has(row.content_item_id)) return false;
      const action = row.feedback_action;
      if (action !== null) return false;
      return row.read_at === null;
    });

    if (filtered.length === 0) {
      return await params.db.catchupPacks.upsert({
        userId: params.userId,
        topicId: params.topicId,
        scopeType: "range",
        scopeHash,
        status: "skipped",
        errorMessage: "No items in scope",
        metaJson: {
          scope: {
            since: params.since,
            until: params.until,
            timeBudgetMinutes: params.timeBudgetMinutes,
          },
          candidateCount: 0,
        },
      });
    }

    const windowStart = new Date(params.since);
    const windowEnd = new Date(params.until);

    // Fetch user preferences for personalized scoring
    const userPreferences = await params.db.feedbackEvents.computeUserPreferences({
      userId: params.userId,
      maxFeedbackAgeDays: 90, // Use recent 90 days of feedback
    });

    const scored: ScoredCandidate[] = filtered.map((row) => {
      const triage = row.triage_json ?? {};
      const triageReason =
        triage && typeof triage === "object" ? (triage as Record<string, unknown>).reason : null;
      const aiScore =
        triage && typeof triage === "object"
          ? ((triage as Record<string, unknown>).ai_score as number | null)
          : null;
      const candidateAt = row.published_at
        ? new Date(row.published_at)
        : new Date(row.digest_created_at);
      const ahaScore01 = toScore01(row.aha_score);
      const recency01 = computeRecency01(candidateAt, windowStart, windowEnd);
      const preferenceScore = computePreferenceScore(row.source_type, row.author, userPreferences);

      // Personalized scoring formula:
      // 50% AI relevance + 20% recency + 20% user preferences + 10% novelty
      // Novelty is always 1 here since we already filtered out recent pack items
      const score = 0.5 * ahaScore01 + 0.2 * recency01 + 0.2 * preferenceScore + 0.1 * 1.0; // noveltyScore = 1 (non-recent items)

      return {
        itemId: row.content_item_id,
        title: row.title,
        bodyText: row.body_text,
        triageReason: triageReason ? String(triageReason) : null,
        aiScore: typeof aiScore === "number" ? aiScore : null,
        ahaScore01,
        sourceType: row.source_type,
        sourceId: row.source_id,
        author: row.author,
        publishedAt: row.published_at,
        candidateAt,
        score,
        tieBreaker: hashTieBreaker(scopeHash, row.content_item_id),
      };
    });

    const targets = getPackTargets(params.timeBudgetMinutes);
    const adaptivePoolSize = calculateAdaptivePoolSize({
      tierTargets: targets.tierTargets,
      candidateCount: scored.length,
    });
    const poolResult = selectPool({
      candidates: scored,
      poolTarget: adaptivePoolSize,
    });
    const pool = poolResult.pool;

    if (pool.length === 0) {
      return await params.db.catchupPacks.upsert({
        userId: params.userId,
        topicId: params.topicId,
        scopeType: "range",
        scopeHash,
        status: "skipped",
        errorMessage: "No candidates after filtering",
        metaJson: {
          scope: {
            since: params.since,
            until: params.until,
            timeBudgetMinutes: params.timeBudgetMinutes,
          },
          candidateCount: filtered.length,
          poolStats: poolResult.stats,
        },
      });
    }

    const chunkSize = Math.min(Math.max(targets.chunkSize, 40), 60);
    const chunks = chunkArray(pool, Math.min(chunkSize, pool.length));

    const tier = params.tier ?? "normal";
    const router = createConfiguredLlmRouter(process.env, params.llmConfig);
    const maxSnippet = parseIntEnv(process.env.OPENAI_CATCHUP_PACK_MAX_SNIPPET_CHARS) ?? 200;

    const selectedById = new Map<string, CatchupPackTierItem>();
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCredits = 0;
    let inputCharCount = 0;

    for (const [index, chunk] of chunks.entries()) {
      const chunkInputItems = chunk.map((candidate) => toTieredInput(candidate, maxSnippet));
      const minSelect = 8;
      const maxSelect = 12;

      const userPayload = {
        budget_tier: tier,
        time_budget_minutes: params.timeBudgetMinutes,
        min_select: minSelect,
        max_select: maxSelect,
        item_count: chunkInputItems.length,
        items: chunkInputItems,
      };
      inputCharCount += JSON.stringify(userPayload).length;

      const callStart = Date.now();
      const result = await catchupPackSelect({
        router,
        tier,
        input: {
          time_budget_minutes: params.timeBudgetMinutes,
          min_select: Math.min(minSelect, chunkInputItems.length),
          max_select: Math.min(maxSelect, chunkInputItems.length),
          items: chunkInputItems,
        },
      });
      const callEnd = Date.now();

      totalInputTokens += result.inputTokens;
      totalOutputTokens += result.outputTokens;
      totalCredits += result.costEstimateCredits;

      for (const selection of result.output.selections) {
        if (!selectedById.has(selection.item_id)) {
          selectedById.set(selection.item_id, selection);
        }
      }

      await params.db.providerCalls.insert({
        userId: params.userId,
        purpose: "catchup_pack_select",
        provider: result.provider,
        model: result.model,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        costEstimateCredits: result.costEstimateCredits,
        meta: {
          scopeHash: scopeHash.slice(0, 16),
          chunkIndex: index,
          chunkSize: chunkInputItems.length,
          timeBudgetMinutes: params.timeBudgetMinutes,
        },
        startedAt: new Date(callStart).toISOString(),
        endedAt: new Date(callEnd).toISOString(),
        status: "ok",
      });
    }

    const selectedCandidates = pool.filter((candidate) => selectedById.has(candidate.itemId));
    if (selectedCandidates.length === 0) {
      return await params.db.catchupPacks.upsert({
        userId: params.userId,
        topicId: params.topicId,
        scopeType: "range",
        scopeHash,
        status: "error",
        errorMessage: "No selections returned from listwise pass",
        metaJson: {
          scope: {
            since: params.since,
            until: params.until,
            timeBudgetMinutes: params.timeBudgetMinutes,
          },
          candidateCount: filtered.length,
          poolStats: poolResult.stats,
        },
      });
    }

    const tierInputItems = selectedCandidates.map((candidate) => ({
      ...toTieredInput(candidate, maxSnippet),
      why: selectedById.get(candidate.itemId)?.why ?? null,
      theme: selectedById.get(candidate.itemId)?.theme ?? null,
    }));

    const tierPayload = {
      budget_tier: tier,
      time_budget_minutes: params.timeBudgetMinutes,
      targets: targets.tierTargets,
      item_count: tierInputItems.length,
      items: tierInputItems,
    };
    inputCharCount += JSON.stringify(tierPayload).length;

    const tierStart = Date.now();
    const tierResult = await catchupPackTier({
      router,
      tier,
      input: {
        time_budget_minutes: params.timeBudgetMinutes,
        targets: targets.tierTargets,
        items: tierInputItems,
      },
    });
    const tierEnd = Date.now();

    totalInputTokens += tierResult.inputTokens;
    totalOutputTokens += tierResult.outputTokens;
    totalCredits += tierResult.costEstimateCredits;

    await params.db.providerCalls.insert({
      userId: params.userId,
      purpose: "catchup_pack_tier",
      provider: tierResult.provider,
      model: tierResult.model,
      inputTokens: tierResult.inputTokens,
      outputTokens: tierResult.outputTokens,
      costEstimateCredits: tierResult.costEstimateCredits,
      meta: {
        scopeHash: scopeHash.slice(0, 16),
        timeBudgetMinutes: params.timeBudgetMinutes,
        inputItemCount: tierInputItems.length,
      },
      startedAt: new Date(tierStart).toISOString(),
      endedAt: new Date(tierEnd).toISOString(),
      status: "ok",
    });

    const allowedIds = new Set(selectedCandidates.map((c) => c.itemId));
    const trimmedTiers = dedupeAndTrimTiers(tierResult.output, allowedIds, targets.tierTargets);
    const trimmedIds = new Set(
      [...trimmedTiers.must_read, ...trimmedTiers.worth_scanning, ...trimmedTiers.headlines].map(
        (item) => item.item_id,
      ),
    );
    const themes = filterThemes(tierResult.output.themes, trimmedIds);

    const summary: CatchupPackOutput = {
      ...tierResult.output,
      tiers: trimmedTiers,
      themes,
    };

    const completed = await params.db.catchupPacks.upsert({
      userId: params.userId,
      topicId: params.topicId,
      scopeType: "range",
      scopeHash,
      status: "complete",
      summaryJson: summary as unknown as Record<string, unknown>,
      promptId: summary.prompt_id,
      schemaVersion: summary.schema_version,
      provider: summary.provider,
      model: summary.model,
      inputItemCount: pool.length,
      inputCharCount: inputCharCount,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      costEstimateCredits: totalCredits,
      metaJson: {
        scope: {
          since: params.since,
          until: params.until,
          timeBudgetMinutes: params.timeBudgetMinutes,
        },
        candidateCount: filtered.length,
        poolStats: poolResult.stats,
        selection: {
          chunkCount: chunks.length,
          selectedCount: selectedCandidates.length,
        },
        timingMs: {
          total: Date.now() - startTime,
        },
      },
    });

    log.info(
      {
        userId: params.userId.slice(0, 8),
        packId: completed.id.slice(0, 8),
        poolCount: pool.length,
        selectedCount: selectedCandidates.length,
        timeBudgetMinutes: params.timeBudgetMinutes,
      },
      "Catch-up pack generated",
    );

    return completed;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error(
      { userId: params.userId.slice(0, 8), scopeHash: scopeHash.slice(0, 8), err: message },
      "Catch-up pack generation failed",
    );
    await params.db.catchupPacks.upsert({
      userId: params.userId,
      topicId: params.topicId,
      scopeType: "range",
      scopeHash,
      status: "error",
      errorMessage: message,
    });
    throw err;
  }
}
