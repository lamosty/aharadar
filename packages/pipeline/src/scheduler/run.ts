import {
  createNotification,
  type Db,
  DEFAULT_SCORING_MODE_CONFIG,
  type DigestSourceResult,
  type ScoringModeConfig,
} from "@aharadar/db";
import type { LlmRuntimeConfig } from "@aharadar/llm";
import type { BudgetTier } from "@aharadar/shared";
import { createLogger } from "@aharadar/shared";
import { type CreditsStatus, computeCreditsStatus, printCreditsWarning } from "../budgets/credits";
import {
  applyBudgetScale,
  applyUsageScale,
  compileDigestPlan,
  type DigestPlan,
} from "../lib/digest_plan";
import { type ClusterRunResult, clusterTopicContentItems } from "../stages/cluster";
import { type DedupeRunResult, dedupeTopicContentItems } from "../stages/dedupe";
import { type DigestRunResult, persistDigestFromContentItems } from "../stages/digest";
import { type EmbedRunResult, embedTopicContentItems } from "../stages/embed";
import {
  type IngestLimits,
  type IngestRunResult,
  type IngestSourceFilter,
  type IngestSourceResult,
  ingestEnabledSources,
} from "../stages/ingest";

const log = createLogger({ component: "pipeline" });

export interface PipelineRunParams {
  userId: string;
  topicId: string;
  windowStart: string;
  windowEnd: string;
  ingest?: Partial<IngestLimits>;
  ingestFilter?: IngestSourceFilter;
  // catch_up mode removed per task-121; now uses only BudgetTier values
  mode?: BudgetTier;
  /** Optional digest overrides (mostly for manual/admin runs) */
  digest?: { maxItems?: number };
  /** Budget config (optional; if not provided, paid calls are always allowed) */
  budget?: {
    monthlyCredits: number;
    dailyThrottleCredits?: number;
  };
  /** Optional runtime LLM configuration (overrides env vars) */
  llmConfig?: LlmRuntimeConfig;
}

export interface PipelineRunResult {
  userId: string;
  topicId: string;
  windowStart: string;
  windowEnd: string;
  ingest: IngestRunResult;
  embed: EmbedRunResult;
  dedupe: DedupeRunResult;
  cluster: ClusterRunResult;
  digest: DigestRunResult | null;
  digestPlan?: DigestPlan;
  creditsStatus?: CreditsStatus;
  /** True if digest was skipped due to credits exhaustion (policy=stop) */
  digestSkippedDueToCredits?: boolean;
}

function resolveTier(mode: BudgetTier | undefined, paidCallsAllowed: boolean): BudgetTier {
  // When credits exhausted, force tier to low
  if (!paidCallsAllowed) return "low";
  // Default to "normal" if mode not specified (catch_up removed per task-121)
  return mode ?? "normal";
}

function clampUsageScale(value: number): number {
  return Math.max(0.5, Math.min(2, value));
}

async function resolveScoringModeConfig(params: {
  db: Db;
  userId: string;
  topic: { scoring_mode_id: string | null };
}): Promise<ScoringModeConfig> {
  const { db, userId, topic } = params;
  if (topic.scoring_mode_id) {
    const mode = await db.scoringModes.getById(topic.scoring_mode_id);
    if (mode) return mode.config;
  }
  const fallback = await db.scoringModes.getDefaultForUser(userId);
  return fallback?.config ?? DEFAULT_SCORING_MODE_CONFIG;
}

const BUDGET_WARNING_SCALES: Record<CreditsStatus["warningLevel"], number> = {
  none: 1,
  approaching: 0.7,
  critical: 0.4,
};

function computeBudgetScale(status?: CreditsStatus): { scale: number; reason: string | null } {
  if (!status) return { scale: 1, reason: null };
  if (!status.paidCallsAllowed) return { scale: 0, reason: "credits_exhausted" };
  const scale = BUDGET_WARNING_SCALES[status.warningLevel] ?? 1;
  if (scale >= 0.999) return { scale: 1, reason: null };
  return { scale, reason: `credits_${status.warningLevel}` };
}

/** Convert IngestSourceResult to DigestSourceResult format */
function toDigestSourceResults(ingestResults: IngestSourceResult[]): DigestSourceResult[] {
  return ingestResults.map((r) => ({
    sourceId: r.sourceId,
    sourceName: r.sourceName,
    sourceType: r.sourceType,
    status: r.status,
    skipReason: r.skipReason,
    itemsFetched: r.fetched,
  }));
}

export async function runPipelineOnce(
  db: Db,
  params: PipelineRunParams,
): Promise<PipelineRunResult> {
  // Check credits status if budget config is provided
  let creditsStatus: CreditsStatus | undefined;
  let paidCallsAllowed = true;

  if (params.budget) {
    creditsStatus = await computeCreditsStatus({
      db,
      userId: params.userId,
      monthlyCredits: params.budget.monthlyCredits,
      dailyThrottleCredits: params.budget.dailyThrottleCredits,
      windowEnd: params.windowEnd,
    });
    paidCallsAllowed = creditsStatus.paidCallsAllowed;
    printCreditsWarning(creditsStatus);

    // Notify on budget exhaustion
    if (!paidCallsAllowed) {
      const monthlyPct = Math.round((creditsStatus.monthlyUsed / creditsStatus.monthlyLimit) * 100);
      const dailyPct =
        creditsStatus.dailyLimit && creditsStatus.dailyLimit > 0
          ? Math.round((creditsStatus.dailyUsed / creditsStatus.dailyLimit) * 100)
          : null;

      await createNotification({
        db,
        userId: params.userId,
        type: "budget_exhausted",
        title: "Budget exhausted",
        body:
          dailyPct !== null && dailyPct >= 100
            ? `Daily budget at ${dailyPct}%. Paid connectors disabled until reset.`
            : `Monthly budget at ${monthlyPct}%. Paid connectors disabled until reset.`,
        severity: "error",
        data: {
          monthlyUsed: creditsStatus.monthlyUsed,
          monthlyLimit: creditsStatus.monthlyLimit,
          dailyUsed: creditsStatus.dailyUsed,
          dailyLimit: creditsStatus.dailyLimit,
        },
      });
    } else if (creditsStatus.warningLevel !== "none") {
      // Notify on budget warning (approaching/critical)
      const monthlyPct = Math.round((creditsStatus.monthlyUsed / creditsStatus.monthlyLimit) * 100);
      await createNotification({
        db,
        userId: params.userId,
        type: "budget_warning",
        title:
          creditsStatus.warningLevel === "critical"
            ? "Budget critical"
            : "Budget approaching limit",
        body: `You've used ${monthlyPct}% of your monthly budget.`,
        severity: creditsStatus.warningLevel === "critical" ? "warning" : "info",
        data: {
          monthlyUsed: creditsStatus.monthlyUsed,
          monthlyLimit: creditsStatus.monthlyLimit,
          warningLevel: creditsStatus.warningLevel,
        },
      });
    }
  }

  const effectiveTier = resolveTier(params.mode, paidCallsAllowed);

  // Load topic to get digest settings
  const topic = await db.topics.getById(params.topicId);
  if (!topic) {
    throw new Error(`Topic not found: ${params.topicId}`);
  }

  // Count enabled sources for this topic
  const enabledSources = await db.sources.listEnabledByUserAndTopic({
    userId: params.userId,
    topicId: params.topicId,
  });
  const enabledSourceCount = enabledSources.length;

  // Compile digest plan from topic settings
  // Use params.mode if provided (for manual/admin overrides), else fall back to topic settings
  const digestMode = params.mode ?? (topic.digest_mode as BudgetTier) ?? "normal";
  const digestDepth = topic.digest_depth ?? 50;

  const digestPlan = compileDigestPlan({
    mode: digestMode,
    digestDepth,
    enabledSourceCount,
  });

  const scoringModeConfig = await resolveScoringModeConfig({
    db,
    userId: params.userId,
    topic,
  });
  const usageScale = clampUsageScale(scoringModeConfig.llm?.usageScale ?? 1);
  const usagePlan = applyUsageScale(digestPlan, usageScale);

  const budgetScale = computeBudgetScale(creditsStatus);
  const effectivePlan =
    budgetScale.scale < 1 ? applyBudgetScale(usagePlan, budgetScale.scale) : usagePlan;

  if (budgetScale.scale < 1) {
    log.info(
      {
        topicId: params.topicId.slice(0, 8),
        warningLevel: creditsStatus?.warningLevel ?? "none",
        scale: budgetScale.scale,
        reason: budgetScale.reason,
        plan: {
          digestMaxItems: effectivePlan.digestMaxItems,
          triageMaxCalls: effectivePlan.triageMaxCalls,
          deepSummaryMaxCalls: effectivePlan.deepSummaryMaxCalls,
        },
      },
      "Budget warning: scaling digest plan",
    );
  }

  log.debug(
    {
      topicId: params.topicId.slice(0, 8),
      mode: digestMode,
      depth: digestDepth,
      sources: enabledSourceCount,
      usageScale,
      plan: effectivePlan,
    },
    "Compiled digest plan",
  );

  const ingestLimits: IngestLimits = {
    maxItemsPerSource: params.ingest?.maxItemsPerSource ?? 50,
  };

  const ingest = await ingestEnabledSources({
    db,
    userId: params.userId,
    topicId: params.topicId,
    windowStart: params.windowStart,
    windowEnd: params.windowEnd,
    limits: ingestLimits,
    filter: params.ingestFilter,
    paidCallsAllowed,
  });

  // Notify on ingest fetch errors
  const erroredSources = ingest.perSource.filter((s) => s.status === "error");
  if (erroredSources.length > 0) {
    const sourceNames = erroredSources.map((s) => s.sourceName).join(", ");
    const errorMessages = erroredSources
      .filter((s) => s.error?.message)
      .map((s) => `${s.sourceName}: ${s.error?.message}`)
      .slice(0, 3);

    await createNotification({
      db,
      userId: params.userId,
      type: "ingest_fetch_error",
      title: `Source fetch failed (${erroredSources.length})`,
      body:
        errorMessages.length > 0
          ? errorMessages.join("; ")
          : `Failed to fetch from: ${sourceNames}`,
      severity: "error",
      data: {
        topicId: params.topicId,
        erroredSources: erroredSources.map((s) => ({
          sourceId: s.sourceId,
          sourceName: s.sourceName,
          sourceType: s.sourceType,
          error: s.error,
        })),
        windowStart: params.windowStart,
        windowEnd: params.windowEnd,
      },
    });
  }

  const embed = await embedTopicContentItems({
    db,
    userId: params.userId,
    topicId: params.topicId,
    windowStart: params.windowStart,
    windowEnd: params.windowEnd,
    tier: effectiveTier,
    paidCallsAllowed,
  });

  const dedupe = await dedupeTopicContentItems({
    db,
    userId: params.userId,
    topicId: params.topicId,
    windowStart: params.windowStart,
    windowEnd: params.windowEnd,
  });

  const cluster = await clusterTopicContentItems({
    db,
    userId: params.userId,
    topicId: params.topicId,
    windowStart: params.windowStart,
    windowEnd: params.windowEnd,
  });

  // Policy=STOP: skip digest creation entirely when paid calls are not allowed
  if (!paidCallsAllowed) {
    return {
      userId: params.userId,
      topicId: params.topicId,
      windowStart: params.windowStart,
      windowEnd: params.windowEnd,
      ingest,
      embed,
      dedupe,
      cluster,
      digest: null,
      digestPlan: effectivePlan,
      creditsStatus,
      digestSkippedDueToCredits: true,
    };
  }

  // Convert ingest results to digest source results format
  const sourceResults = toDigestSourceResults(ingest.perSource);

  // Check if any source was skipped
  const skippedSources = ingest.perSource.filter((s) => s.status === "skipped");
  const hasSkippedSources = skippedSources.length > 0;

  // Policy: FAIL - when any source is skipped, create failed digest record
  // This gives users visibility into what happened
  if (hasSkippedSources) {
    const skippedNames = skippedSources.map((s) => `${s.sourceName} (${s.skipReason})`).join(", ");
    const errorMessage = `Sources skipped: ${skippedNames}`;

    log.info(
      {
        topicId: params.topicId.slice(0, 8),
        windowStart: params.windowStart,
        windowEnd: params.windowEnd,
        skippedSources: skippedSources.map((s) => s.sourceName),
      },
      "Creating failed digest: sources were skipped",
    );

    // Create failed digest record (no items)
    const failedDigest = await db.digests.upsert({
      userId: params.userId,
      topicId: params.topicId,
      windowStart: params.windowStart,
      windowEnd: params.windowEnd,
      mode: digestMode,
      status: "failed",
      creditsUsed: 0, // TODO: calculate actual credits used for ingest
      sourceResults,
      errorMessage,
    });

    // Notify on digest failure
    await createNotification({
      db,
      userId: params.userId,
      type: "digest_failed",
      title: "Digest generation failed",
      body: errorMessage,
      severity: "warning",
      data: {
        digestId: failedDigest.id,
        topicId: params.topicId,
        topicName: topic.name,
        skippedSources: skippedSources.map((s) => ({
          sourceName: s.sourceName,
          skipReason: s.skipReason,
        })),
        windowStart: params.windowStart,
        windowEnd: params.windowEnd,
      },
    });

    return {
      userId: params.userId,
      topicId: params.topicId,
      windowStart: params.windowStart,
      windowEnd: params.windowEnd,
      ingest,
      embed,
      dedupe,
      cluster,
      digest: {
        digestId: failedDigest.id,
        mode: digestMode,
        topicId: params.topicId,
        windowStart: params.windowStart,
        windowEnd: params.windowEnd,
        items: 0,
        triaged: 0,
        paidCallsAllowed,
      },
      digestPlan,
      creditsStatus,
      digestSkippedDueToCredits: !paidCallsAllowed,
    };
  }

  // Use plan's digestMaxItems, unless explicitly overridden in params
  const effectiveMaxItems = params.digest?.maxItems ?? effectivePlan.digestMaxItems;

  const digest = await persistDigestFromContentItems({
    db,
    userId: params.userId,
    topicId: params.topicId,
    windowStart: params.windowStart,
    windowEnd: params.windowEnd,
    mode: digestMode,
    limits: {
      maxItems: effectiveMaxItems,
      triageMaxCalls: effectivePlan.triageMaxCalls,
      candidatePoolMax: effectivePlan.candidatePoolMax,
      deepSummaryMaxCalls: effectivePlan.deepSummaryMaxCalls,
    },
    filter: params.ingestFilter,
    paidCallsAllowed,
    llmConfig: params.llmConfig,
    sourceResults,
  });

  return {
    userId: params.userId,
    topicId: params.topicId,
    windowStart: params.windowStart,
    windowEnd: params.windowEnd,
    ingest,
    embed,
    dedupe,
    cluster,
    digest,
    digestPlan: effectivePlan,
    creditsStatus,
  };
}
