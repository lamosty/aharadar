import type { Db } from "@aharadar/db";
import {
  type AggregateSummaryCallResult,
  type AggregateSummaryInput,
  type AggregateSummaryItem,
  aggregateSummary,
  createConfiguredLlmRouter,
  type LlmRuntimeConfig,
} from "@aharadar/llm";
import {
  type AggregateSummary,
  type BudgetTier,
  createLogger,
  type ProviderCallDraft,
} from "@aharadar/shared";

const log = createLogger({ component: "aggregate_summary" });

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

/**
 * Build aggregate summary input from digest items.
 * Fetches item data and constructs input payload with proper truncation.
 */
async function buildAggregateInputFromDigest(params: {
  db: Db;
  digestId: string;
  maxInputChars?: number;
  maxItemBodyChars?: number;
  maxItems?: number;
}): Promise<{
  input: AggregateSummaryInput;
  stats: {
    itemCount: number;
    charCount: number;
    droppedCount: number;
    droppedReason: string | null;
  };
}> {
  const maxInputChars =
    params.maxInputChars ?? parseIntEnv(process.env.AGG_SUMMARY_MAX_INPUT_CHARS) ?? 50000;
  const maxItemBodyChars =
    params.maxItemBodyChars ?? parseIntEnv(process.env.AGG_SUMMARY_MAX_ITEM_BODY_CHARS) ?? 500;
  const maxItems = params.maxItems ?? parseIntEnv(process.env.AGG_SUMMARY_MAX_ITEMS) ?? 50;

  // Query digest with items
  const digestResult = await params.db.query<{
    id: string;
    window_start: string;
    window_end: string;
  }>(`SELECT id, window_start::text, window_end::text FROM digests WHERE id = $1`, [
    params.digestId,
  ]);

  const digest = digestResult.rows[0];
  if (!digest) {
    throw new Error(`Digest not found: ${params.digestId}`);
  }

  // Query digest items with content data
  const itemsResult = await params.db.query<{
    rank: number;
    aha_score: number;
    ai_score: number | null;
    cluster_id: string | null;
    content_item_id: string | null;
    item_title: string | null;
    item_url: string | null;
    item_source_type: string | null;
    item_body_text: string | null;
    item_published_at: string | null;
    triage_json: Record<string, unknown> | null;
    cluster_member_count: number | null;
    cluster_member_titles: unknown; // JSON array
  }>(
    `SELECT
       di.rank,
       di.aha_score,
       (di.triage_json->>'ai_score')::real as ai_score,
       di.cluster_id,
       di.content_item_id,
       COALESCE(ci.title, ci_rep.title) as item_title,
       COALESCE(ci.canonical_url, ci_rep.canonical_url) as item_url,
       COALESCE(ci.source_type, ci_rep.source_type) as item_source_type,
       COALESCE(ci.body_text, ci_rep.body_text) as item_body_text,
       COALESCE(ci.published_at, ci_rep.published_at)::text as item_published_at,
       di.triage_json,
       cluster_count.member_count as cluster_member_count,
       cluster_members.items_json as cluster_member_titles
     FROM digest_items di
     LEFT JOIN content_items ci ON ci.id = di.content_item_id
     LEFT JOIN clusters cl ON cl.id = di.cluster_id
     LEFT JOIN content_items ci_rep ON ci_rep.id = cl.representative_content_item_id
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::int as member_count
       FROM cluster_items cli
       WHERE cli.cluster_id = di.cluster_id
     ) cluster_count ON di.cluster_id IS NOT NULL
     LEFT JOIN LATERAL (
       SELECT COALESCE(
         json_agg(
           json_build_object('title', ci_member.title, 'source_type', ci_member.source_type)
           ORDER BY cli.similarity DESC NULLS LAST
         ) FILTER (WHERE ci_member.id IS NOT NULL),
         '[]'::json
       ) as items_json
       FROM cluster_items cli
       JOIN content_items ci_member ON ci_member.id = cli.content_item_id
       WHERE cli.cluster_id = di.cluster_id
         AND ci_member.deleted_at IS NULL
     ) cluster_members ON di.cluster_id IS NOT NULL
     WHERE di.digest_id = $1
     ORDER BY di.aha_score DESC`,
    [params.digestId],
  );

  const items: AggregateSummaryItem[] = [];
  let charCount = 0;
  const droppedIds: string[] = [];

  // Build items, stopping at max items or max chars
  for (const row of itemsResult.rows) {
    if (items.length >= maxItems) {
      droppedIds.push(row.content_item_id || row.cluster_id || `rank_${row.rank}`);
      continue;
    }

    // Extract triage reason from triage_json
    const triageReason =
      row.triage_json && typeof row.triage_json === "object"
        ? (row.triage_json as Record<string, unknown>).reason
        : null;

    // Extract cluster members if cluster
    let clusterMembers: Array<{ title: string | null; source_type: string }> | undefined;
    if (row.cluster_id && Array.isArray(row.cluster_member_titles)) {
      clusterMembers = (
        row.cluster_member_titles as Array<{
          title: string | null;
          source_type: string;
        }>
      ).slice(0, 3);
    }

    const item: AggregateSummaryItem = {
      item_id: row.content_item_id || row.cluster_id || `digest_rank_${row.rank}`,
      title: clampText(row.item_title, 240),
      body_snippet: clampText(row.item_body_text, maxItemBodyChars),
      triage_reason: triageReason ? String(triageReason) : null,
      ai_score: row.ai_score,
      aha_score: row.aha_score,
      source_type: row.item_source_type || "unknown",
      published_at: row.item_published_at,
      url: row.item_url,
      cluster_member_count: row.cluster_member_count ?? undefined,
      cluster_members: clusterMembers,
    };

    // Estimate item's JSON size
    const itemJson = JSON.stringify(item);
    const itemSize = itemJson.length;

    if (charCount + itemSize > maxInputChars && items.length > 0) {
      // At capacity - drop remaining items (already sorted by aha_score desc)
      droppedIds.push(row.content_item_id || row.cluster_id || `rank_${row.rank}`);
      continue;
    }

    items.push(item);
    charCount += itemSize;
  }

  const droppedReason =
    droppedIds.length > 0
      ? charCount >= maxInputChars
        ? `Exceeded max input chars (${maxInputChars})`
        : items.length >= maxItems
          ? `Exceeded max items (${maxItems})`
          : null
      : null;

  return {
    input: {
      items,
      scope_type: "digest",
      window_start: digest.window_start,
      window_end: digest.window_end,
    },
    stats: {
      itemCount: items.length,
      charCount,
      droppedCount: droppedIds.length,
      droppedReason,
    },
  };
}

/**
 * Build aggregate summary input from inbox items (items matching a time range).
 */
async function buildAggregateInputFromInbox(params: {
  db: Db;
  userId: string;
  topicId?: string;
  since: string;
  until: string;
  maxInputChars?: number;
  maxItemBodyChars?: number;
  maxItems?: number;
}): Promise<{
  input: AggregateSummaryInput;
  stats: {
    itemCount: number;
    charCount: number;
    droppedCount: number;
    droppedReason: string | null;
  };
}> {
  const maxInputChars =
    params.maxInputChars ?? parseIntEnv(process.env.AGG_SUMMARY_MAX_INPUT_CHARS) ?? 50000;
  const maxItemBodyChars =
    params.maxItemBodyChars ?? parseIntEnv(process.env.AGG_SUMMARY_MAX_ITEM_BODY_CHARS) ?? 500;
  const maxItems = params.maxItems ?? parseIntEnv(process.env.AGG_SUMMARY_MAX_ITEMS) ?? 50;

  // Query inbox items with optional topic filter (via sources table)
  const topicJoin = params.topicId
    ? "JOIN sources s ON s.id = ci.source_id AND s.topic_id = $4::uuid"
    : "";
  const queryParams = params.topicId
    ? [params.userId, params.since, params.until, params.topicId]
    : [params.userId, params.since, params.until];

  // Join with latest digest_items to get scores (if available)
  const itemsResult = await params.db.query<{
    id: string;
    ai_score: number | null;
    aha_score: number | null;
    title: string | null;
    canonical_url: string | null;
    source_type: string;
    body_text: string | null;
    published_at: string | null;
  }>(
    `SELECT
       ci.id,
       (ldi.triage_json->>'ai_score')::real as ai_score,
       ldi.aha_score,
       ci.title,
       ci.canonical_url,
       ci.source_type,
       ci.body_text,
       ci.published_at::text
     FROM content_items ci
     ${topicJoin}
     LEFT JOIN LATERAL (
       SELECT di.aha_score, di.triage_json
       FROM digest_items di
       JOIN digests d ON d.id = di.digest_id
       WHERE di.content_item_id = ci.id
       ORDER BY d.created_at DESC
       LIMIT 1
     ) ldi ON true
     WHERE ci.user_id = $1
       AND ci.published_at >= $2::timestamptz AND ci.published_at <= $3::timestamptz
     ORDER BY COALESCE(ldi.aha_score, 0) DESC, ci.published_at DESC
     LIMIT $${params.topicId ? "5" : "4"}`,
    [...queryParams, params.maxItems],
  );

  const items: AggregateSummaryItem[] = [];
  let charCount = 0;
  const droppedIds: string[] = [];

  for (const row of itemsResult.rows) {
    if (items.length >= maxItems) {
      droppedIds.push(row.id);
      continue;
    }

    const item: AggregateSummaryItem = {
      item_id: row.id,
      title: clampText(row.title, 240),
      body_snippet: clampText(row.body_text, maxItemBodyChars),
      triage_reason: null,
      ai_score: row.ai_score,
      aha_score: row.aha_score ?? 0,
      source_type: row.source_type,
      published_at: row.published_at,
      url: row.canonical_url,
    };

    const itemJson = JSON.stringify(item);
    const itemSize = itemJson.length;

    if (charCount + itemSize > maxInputChars && items.length > 0) {
      droppedIds.push(row.id);
      continue;
    }

    items.push(item);
    charCount += itemSize;
  }

  const droppedReason =
    droppedIds.length > 0
      ? charCount >= maxInputChars
        ? `Exceeded max input chars (${maxInputChars})`
        : items.length >= maxItems
          ? `Exceeded max items (${maxItems})`
          : null
      : null;

  return {
    input: {
      items,
      scope_type: "inbox",
      window_start: params.since,
      window_end: params.until,
    },
    stats: {
      itemCount: items.length,
      charCount,
      droppedCount: droppedIds.length,
      droppedReason,
    },
  };
}

export interface GenerateAggregateSummaryParams {
  db: Db;
  userId: string;
  scopeType: "digest" | "inbox" | "range" | "custom";
  scopeHash: string;
  digestId?: string;
  topicId?: string;
  since?: string;
  until?: string;
  tier?: BudgetTier;
  llmConfig?: LlmRuntimeConfig;
}

/**
 * Generate an aggregate summary for a digest or inbox scope.
 * Handles budget checking, input building, LLM calling, and DB persistence.
 */
export async function generateAggregateSummary(
  params: GenerateAggregateSummaryParams,
): Promise<AggregateSummary> {
  const tier = params.tier ?? "normal";

  log.debug(
    {
      userId: params.userId.slice(0, 8),
      scopeType: params.scopeType,
      scopeHash: params.scopeHash.slice(0, 8),
      digestId: params.digestId?.slice(0, 8),
      topicId: params.topicId?.slice(0, 8),
    },
    "Starting aggregate summary generation",
  );

  // Check if summary already exists
  const _existing = await params.db.aggregateSummaries.getByHash({
    userId: params.userId,
    scopeHash: params.scopeHash,
  });

  // Build input based on scope type
  let buildResult: Awaited<ReturnType<typeof buildAggregateInputFromDigest>>;
  try {
    if (params.scopeType === "digest" && params.digestId) {
      buildResult = await buildAggregateInputFromDigest({
        db: params.db,
        digestId: params.digestId,
      });
    } else if (
      (params.scopeType === "inbox" || params.scopeType === "range") &&
      params.since &&
      params.until
    ) {
      buildResult = await buildAggregateInputFromInbox({
        db: params.db,
        userId: params.userId,
        topicId: params.topicId,
        since: params.since,
        until: params.until,
      });
    } else {
      throw new Error(
        `Invalid scope: type=${params.scopeType}, digestId=${params.digestId}, since=${params.since}`,
      );
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    log.error(
      { userId: params.userId.slice(0, 8), scopeType: params.scopeType, err: errorMessage },
      "Failed to build aggregate input",
    );

    // Upsert with error status
    return await params.db.aggregateSummaries.upsert({
      userId: params.userId,
      scopeType: params.scopeType,
      scopeHash: params.scopeHash,
      digestId: params.digestId,
      topicId: params.topicId,
      status: "error",
      errorMessage,
    });
  }

  const { input, stats } = buildResult;

  // Check if input is empty
  if (input.items.length === 0) {
    log.info(
      { userId: params.userId.slice(0, 8), scopeType: params.scopeType },
      "No items for aggregate summary (empty scope)",
    );

    return await params.db.aggregateSummaries.upsert({
      userId: params.userId,
      scopeType: params.scopeType,
      scopeHash: params.scopeHash,
      digestId: params.digestId,
      topicId: params.topicId,
      status: "skipped",
      errorMessage: "No items in scope",
      metaJson: { inputStats: stats },
    });
  }

  // Estimate credits and check budget
  // Max output: 2000 tokens, max input: based on items
  const estimatedInputTokens = Math.ceil(stats.charCount / 4); // Rough estimate: 1 token ~= 4 chars
  const estimatedOutputTokens = parseIntEnv(process.env.AGG_SUMMARY_MAX_OUTPUT_TOKENS) ?? 2000;
  const estimatedCredits = Math.ceil(
    (estimatedInputTokens / 1000) * 0.001 + (estimatedOutputTokens / 1000) * 0.002,
  ); // Rough credit estimate

  log.debug(
    {
      userId: params.userId.slice(0, 8),
      estimatedInputTokens,
      estimatedOutputTokens,
      estimatedCredits,
    },
    "Estimated credits for aggregate summary",
  );

  // For now, skip budget checking (to be implemented with db.budgets.checkCreditsAvailable)
  // TODO: Implement proper budget checking when available

  // Call LLM
  let router: ReturnType<typeof createConfiguredLlmRouter> | null = null;
  let result: AggregateSummaryCallResult;

  try {
    router = createConfiguredLlmRouter(process.env, params.llmConfig);
    const callResult = await aggregateSummary({
      router,
      tier,
      input,
    });

    result = callResult;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    log.error(
      { userId: params.userId.slice(0, 8), scopeType: params.scopeType, err: errorMessage },
      "Failed to call aggregate summary LLM",
    );

    return await params.db.aggregateSummaries.upsert({
      userId: params.userId,
      scopeType: params.scopeType,
      scopeHash: params.scopeHash,
      digestId: params.digestId,
      topicId: params.topicId,
      status: "error",
      errorMessage,
      metaJson: { inputStats: stats },
    });
  }

  // Record provider call
  try {
    const providerCall: ProviderCallDraft = {
      userId: params.userId,
      purpose: "aggregate_summary",
      provider: result.provider,
      model: result.model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      costEstimateCredits: result.costEstimateCredits,
      status: "ok",
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      meta: {
        scopeType: params.scopeType,
        scopeHash: params.scopeHash.slice(0, 16),
        inputItemCount: input.items.length,
      },
    };

    await params.db.providerCalls.insert(providerCall);
  } catch (err) {
    log.warn(
      { userId: params.userId.slice(0, 8), err: err instanceof Error ? err.message : String(err) },
      "Failed to record provider call (non-fatal)",
    );
  }

  // Upsert summary with successful result
  const summary = await params.db.aggregateSummaries.upsert({
    userId: params.userId,
    scopeType: params.scopeType,
    scopeHash: params.scopeHash,
    digestId: params.digestId,
    topicId: params.topicId,
    status: "complete",
    summaryJson: result.output as unknown as Record<string, unknown>,
    promptId: result.output.prompt_id,
    schemaVersion: result.output.schema_version,
    provider: result.provider,
    model: result.model,
    inputItemCount: input.items.length,
    inputCharCount: stats.charCount,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    costEstimateCredits: result.costEstimateCredits,
    metaJson: {
      inputStats: stats,
      scope: {
        type: params.scopeType,
        digestId: params.digestId,
        topicId: params.topicId,
        since: params.since,
        until: params.until,
      },
    },
  });

  log.info(
    {
      userId: params.userId.slice(0, 8),
      summaryId: summary.id.slice(0, 8),
      scopeType: params.scopeType,
      itemCount: input.items.length,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    },
    "Aggregate summary generated successfully",
  );

  return summary;
}
