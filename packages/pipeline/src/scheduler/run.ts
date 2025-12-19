import type { Db } from "@aharadar/db";

import { ingestEnabledSources, type IngestLimits, type IngestRunResult, type IngestSourceFilter } from "../stages/ingest";

export interface PipelineRunParams {
  userId: string;
  windowStart: string;
  windowEnd: string;
  ingest?: Partial<IngestLimits>;
  ingestFilter?: IngestSourceFilter;
}

export interface PipelineRunResult {
  userId: string;
  windowStart: string;
  windowEnd: string;
  ingest: IngestRunResult;
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

  return {
    userId: params.userId,
    windowStart: params.windowStart,
    windowEnd: params.windowEnd,
    ingest,
  };
}
