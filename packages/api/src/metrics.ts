import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from "prom-client";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  MetricLabels,
  MetricNames,
  HTTP_DURATION_BUCKETS,
} from "@aharadar/shared";

/** Global registry for API metrics */
export const registry = new Registry();

// Collect default Node.js metrics (memory, CPU, event loop, etc.)
collectDefaultMetrics({ register: registry });

/** HTTP request duration histogram */
export const httpRequestDuration = new Histogram({
  name: MetricNames.HTTP_REQUEST_DURATION,
  help: "Duration of HTTP requests in seconds",
  labelNames: [MetricLabels.METHOD, MetricLabels.ROUTE, MetricLabels.STATUS_CODE],
  buckets: HTTP_DURATION_BUCKETS,
  registers: [registry],
});

/** HTTP requests counter */
export const httpRequestsTotal = new Counter({
  name: MetricNames.HTTP_REQUESTS_TOTAL,
  help: "Total number of HTTP requests",
  labelNames: [MetricLabels.METHOD, MetricLabels.ROUTE, MetricLabels.STATUS_CODE],
  registers: [registry],
});

/** Active HTTP connections gauge */
export const httpActiveConnections = new Gauge({
  name: MetricNames.HTTP_ACTIVE_CONNECTIONS,
  help: "Number of active HTTP connections",
  registers: [registry],
});

/**
 * Normalize route path by replacing dynamic segments with placeholders.
 * e.g., /api/digests/abc123 -> /api/digests/:id
 */
function normalizeRoute(url: string): string {
  // Remove query string
  const path = url.split("?")[0] ?? url;

  // Replace UUID-like segments
  return path
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "/:id")
    // Replace numeric IDs
    .replace(/\/\d+/g, "/:id");
}

/**
 * Register metrics hooks on a Fastify instance.
 */
export function registerMetricsHooks(fastify: FastifyInstance): void {
  // Track request start time
  fastify.addHook("onRequest", async (request: FastifyRequest) => {
    httpActiveConnections.inc();
    (request as FastifyRequest & { metricsStartTime: bigint }).metricsStartTime = process.hrtime.bigint();
  });

  // Record metrics on response
  fastify.addHook("onResponse", async (request: FastifyRequest, reply: FastifyReply) => {
    httpActiveConnections.dec();

    const startTime = (request as FastifyRequest & { metricsStartTime?: bigint }).metricsStartTime;
    if (!startTime) return;

    const durationNs = process.hrtime.bigint() - startTime;
    const durationSec = Number(durationNs) / 1e9;

    const labels = {
      [MetricLabels.METHOD]: request.method,
      [MetricLabels.ROUTE]: normalizeRoute(request.url),
      [MetricLabels.STATUS_CODE]: String(reply.statusCode),
    };

    httpRequestDuration.observe(labels, durationSec);
    httpRequestsTotal.inc(labels);
  });
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
