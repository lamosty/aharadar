import type { Db } from "@aharadar/db";
import type { BudgetTier } from "@aharadar/shared";

import { ingestEnabledSources, type IngestLimits, type IngestRunResult, type IngestSourceFilter } from "../stages/ingest";
import { embedTopicContentItems, type EmbedRunResult } from "../stages/embed";
import { dedupeTopicContentItems, type DedupeRunResult } from "../stages/dedupe";
import { clusterTopicContentItems, type ClusterRunResult } from "../stages/cluster";
import { persistDigestFromContentItems, type DigestRunResult } from "../stages/digest";

export interface PipelineRunParams {
  userId: string;
  topicId: string;
  windowStart: string;
  windowEnd: string;
  ingest?: Partial<IngestLimits>;
  ingestFilter?: IngestSourceFilter;
  mode?: BudgetTier | "catch_up";
  digest?: { maxItems?: number };
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
}

function resolveTier(mode: BudgetTier | "catch_up" | undefined): BudgetTier {
  if (!mode || mode === "catch_up") return "high";
  return mode;
}

export async function runPipelineOnce(db: Db, params: PipelineRunParams): Promise<PipelineRunResult> {
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
  });

  const embed = await embedTopicContentItems({
    db,
    userId: params.userId,
    topicId: params.topicId,
    windowStart: params.windowStart,
    windowEnd: params.windowEnd,
    tier: resolveTier(params.mode),
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
    mode: params.mode ?? "normal",
    limits: { maxItems: params.digest?.maxItems ?? 20 },
    filter: params.ingestFilter,
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
  };
}
