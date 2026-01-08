import http from "node:http";
import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from "prom-client";
import {
  MetricLabels,
  MetricNames,
  PIPELINE_DURATION_BUCKETS,
  LLM_DURATION_BUCKETS,
} from "@aharadar/shared";

/** Global registry for Worker metrics */
export const registry = new Registry();

// Collect default Node.js metrics (memory, CPU, event loop, etc.)
collectDefaultMetrics({ register: registry });

/** Pipeline run duration histogram */
export const pipelineRunDuration = new Histogram({
  name: MetricNames.PIPELINE_RUN_DURATION,
  help: "Duration of pipeline runs in seconds",
  labelNames: [MetricLabels.STAGE, MetricLabels.STATUS],
  buckets: PIPELINE_DURATION_BUCKETS,
  registers: [registry],
});

/** Pipeline runs counter */
export const pipelineRunsTotal = new Counter({
  name: MetricNames.PIPELINE_RUNS_TOTAL,
  help: "Total number of pipeline runs",
  labelNames: [MetricLabels.STAGE, MetricLabels.STATUS],
  registers: [registry],
});

/** Ingested items counter */
export const ingestItemsTotal = new Counter({
  name: MetricNames.INGEST_ITEMS_TOTAL,
  help: "Total number of items ingested",
  labelNames: [MetricLabels.SOURCE_TYPE, MetricLabels.STATUS],
  registers: [registry],
});

/** LLM call duration histogram */
export const llmCallDuration = new Histogram({
  name: MetricNames.LLM_CALL_DURATION,
  help: "Duration of LLM calls in seconds",
  labelNames: [MetricLabels.PROVIDER, MetricLabels.MODEL, MetricLabels.PURPOSE],
  buckets: LLM_DURATION_BUCKETS,
  registers: [registry],
});

/** LLM calls counter */
export const llmCallsTotal = new Counter({
  name: MetricNames.LLM_CALLS_TOTAL,
  help: "Total number of LLM calls",
  labelNames: [MetricLabels.PROVIDER, MetricLabels.MODEL, MetricLabels.PURPOSE, MetricLabels.STATUS],
  registers: [registry],
});

/** Credits consumed counter */
export const creditsConsumedTotal = new Counter({
  name: MetricNames.CREDITS_CONSUMED_TOTAL,
  help: "Total credits consumed",
  labelNames: [MetricLabels.PROVIDER, MetricLabels.PURPOSE],
  registers: [registry],
});

/** Queue depth gauge */
export const queueDepth = new Gauge({
  name: MetricNames.QUEUE_DEPTH,
  help: "Current queue depth",
  labelNames: [MetricLabels.QUEUE_NAME],
  registers: [registry],
});

/**
 * Record pipeline stage metrics.
 */
export function recordPipelineStage(params: {
  stage: string;
  status: "success" | "error";
  durationSec: number;
}): void {
  const labels = {
    [MetricLabels.STAGE]: params.stage,
    [MetricLabels.STATUS]: params.status,
  };
  pipelineRunDuration.observe(labels, params.durationSec);
  pipelineRunsTotal.inc(labels);
}

/**
 * Record ingestion metrics.
 */
export function recordIngestItems(params: {
  sourceType: string;
  status: "success" | "skipped" | "error";
  count: number;
}): void {
  const labels = {
    [MetricLabels.SOURCE_TYPE]: params.sourceType,
    [MetricLabels.STATUS]: params.status,
  };
  ingestItemsTotal.inc(labels, params.count);
}

/**
 * Record LLM call metrics.
 */
export function recordLlmCall(params: {
  provider: string;
  model: string;
  purpose: string;
  status: "success" | "error";
  durationSec: number;
  credits?: number;
}): void {
  const durationLabels = {
    [MetricLabels.PROVIDER]: params.provider,
    [MetricLabels.MODEL]: params.model,
    [MetricLabels.PURPOSE]: params.purpose,
  };
  llmCallDuration.observe(durationLabels, params.durationSec);

  const countLabels = {
    ...durationLabels,
    [MetricLabels.STATUS]: params.status,
  };
  llmCallsTotal.inc(countLabels);

  if (params.credits && params.credits > 0) {
    creditsConsumedTotal.inc(
      {
        [MetricLabels.PROVIDER]: params.provider,
        [MetricLabels.PURPOSE]: params.purpose,
      },
      params.credits
    );
  }
}

/**
 * Update queue depth gauge.
 */
export function updateQueueDepth(queueName: string, depth: number): void {
  queueDepth.set({ [MetricLabels.QUEUE_NAME]: queueName }, depth);
}

/**
 * Get metrics in Prometheus text format.
 */
export async function getMetrics(): Promise<string> {
  return registry.metrics();
}

/**
 * Get the content type for Prometheus metrics.
 */
export function getMetricsContentType(): string {
  return registry.contentType;
}

/**
 * Start a simple HTTP server for exposing metrics.
 * Returns a function to close the server.
 */
export function startMetricsServer(port: number): { close: () => Promise<void> } {
  const server = http.createServer(async (req, res) => {
    if (req.url === "/metrics" && req.method === "GET") {
      const metrics = await getMetrics();
      res.setHeader("Content-Type", getMetricsContentType());
      res.end(metrics);
    } else {
      res.statusCode = 404;
      res.end("Not Found");
    }
  });

  server.listen(port);

  return {
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
