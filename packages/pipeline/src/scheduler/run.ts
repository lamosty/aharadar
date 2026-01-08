import type { Db } from "@aharadar/db";
import type { LlmRuntimeConfig } from "@aharadar/llm";
import type { BudgetTier } from "@aharadar/shared";

import {
  ingestEnabledSources,
  type IngestLimits,
  type IngestRunResult,
  type IngestSourceFilter,
} from "../stages/ingest";
import { embedTopicContentItems, type EmbedRunResult } from "../stages/embed";
import { dedupeTopicContentItems, type DedupeRunResult } from "../stages/dedupe";
import { clusterTopicContentItems, type ClusterRunResult } from "../stages/cluster";
import { persistDigestFromContentItems, type DigestRunResult } from "../stages/digest";
import { computeCreditsStatus, printCreditsWarning, type CreditsStatus } from "../budgets/credits";

export interface PipelineRunParams {
  userId: string;
  topicId: string;
  windowStart: string;
  windowEnd: string;
  ingest?: Partial<IngestLimits>;
  ingestFilter?: IngestSourceFilter;
  mode?: BudgetTier | "catch_up";
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
  creditsStatus?: CreditsStatus;
}

function resolveTier(mode: BudgetTier | "catch_up" | undefined, paidCallsAllowed: boolean): BudgetTier {
  // When credits exhausted, force tier to low
  if (!paidCallsAllowed) return "low";
  if (!mode || mode === "catch_up") return "high";
  return mode;
}

export async function runPipelineOnce(db: Db, params: PipelineRunParams): Promise<PipelineRunResult> {
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

  const digest = await persistDigestFromContentItems({
    db,
    userId: params.userId,
    topicId: params.topicId,
    windowStart: params.windowStart,
    windowEnd: params.windowEnd,
    mode: paidCallsAllowed ? (params.mode ?? "normal") : "low",
    limits: { maxItems: params.digest?.maxItems ?? 20 },
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
    creditsStatus,
  };
}
