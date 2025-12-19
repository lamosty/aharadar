import type { Db } from "@aharadar/db";
import type { BudgetTier } from "@aharadar/shared";

import { ingestEnabledSources, type IngestLimits, type IngestRunResult, type IngestSourceFilter } from "../stages/ingest";
import { persistDigestFromContentItems, type DigestRunResult } from "../stages/digest";

export interface PipelineRunParams {
  userId: string;
  windowStart: string;
  windowEnd: string;
  ingest?: Partial<IngestLimits>;
  ingestFilter?: IngestSourceFilter;
  mode?: BudgetTier | "catch_up";
  digest?: { maxItems?: number };
}

export interface PipelineRunResult {
  userId: string;
  windowStart: string;
  windowEnd: string;
  ingest: IngestRunResult;
  digest: DigestRunResult | null;
}

export async function runPipelineOnce(db: Db, params: PipelineRunParams): Promise<PipelineRunResult> {
  const ingestLimits: IngestLimits = {
    maxItemsPerSource: params.ingest?.maxItemsPerSource ?? 50,
  };

  const ingest = await ingestEnabledSources({
    db,
    userId: params.userId,
    windowStart: params.windowStart,
    windowEnd: params.windowEnd,
    limits: ingestLimits,
    filter: params.ingestFilter,
  });

  const digest = await persistDigestFromContentItems({
    db,
    userId: params.userId,
    windowStart: params.windowStart,
    windowEnd: params.windowEnd,
    mode: params.mode ?? "normal",
    limits: { maxItems: params.digest?.maxItems ?? 20 },
    filter: params.ingestFilter,
  });

  return {
    userId: params.userId,
    windowStart: params.windowStart,
    windowEnd: params.windowEnd,
    ingest,
    digest,
  };
}
