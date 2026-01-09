import type { Db } from "@aharadar/db";
import type { LlmRuntimeConfig } from "@aharadar/llm";
import type { BudgetTier } from "@aharadar/shared";
import { createLogger } from "@aharadar/shared";
import { type CreditsStatus, computeCreditsStatus, printCreditsWarning } from "../budgets/credits";
import { compileDigestPlan, type DigestPlan } from "../lib/digest_plan";
import { type ClusterRunResult, clusterTopicContentItems } from "../stages/cluster";
import { type DedupeRunResult, dedupeTopicContentItems } from "../stages/dedupe";
import { type DigestRunResult, persistDigestFromContentItems } from "../stages/digest";
import { type EmbedRunResult, embedTopicContentItems } from "../stages/embed";
import {
  type IngestLimits,
  type IngestRunResult,
  type IngestSourceFilter,
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
  const digestMode = (topic.digest_mode as BudgetTier) ?? "normal";
  const digestDepth = topic.digest_depth ?? 50;

  const digestPlan = compileDigestPlan({
    mode: digestMode,
    digestDepth,
    enabledSourceCount,
  });

  log.debug(
    {
      topicId: params.topicId.slice(0, 8),
      mode: digestMode,
      depth: digestDepth,
      sources: enabledSourceCount,
      plan: digestPlan,
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

  // Policy: STOP - when credits exhausted, skip digest creation for scheduled runs
  // This prevents creating empty/low-quality digests when we can't afford triage
  if (!paidCallsAllowed && params.budget) {
    log.info(
      {
        topicId: params.topicId.slice(0, 8),
        windowStart: params.windowStart,
        windowEnd: params.windowEnd,
      },
      "Skipping digest creation: credits exhausted (policy=stop)",
    );

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
      digestPlan,
      creditsStatus,
      digestSkippedDueToCredits: true,
    };
  }

  // Use plan's digestMaxItems, unless explicitly overridden in params
  const effectiveMaxItems = params.digest?.maxItems ?? digestPlan.digestMaxItems;

  const digest = await persistDigestFromContentItems({
    db,
    userId: params.userId,
    topicId: params.topicId,
    windowStart: params.windowStart,
    windowEnd: params.windowEnd,
    mode: digestMode,
    limits: {
      maxItems: effectiveMaxItems,
      triageMaxCalls: digestPlan.triageMaxCalls,
      candidatePoolMax: digestPlan.candidatePoolMax,
    },
    filter: params.ingestFilter,
    paidCallsAllowed,
    llmConfig: params.llmConfig,
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
    digestPlan,
    creditsStatus,
  };
}
