import { Queue } from "bullmq";
import type { ConnectionOptions } from "bullmq";
import type { BudgetTier } from "@aharadar/shared";

/**
 * Queue name for pipeline jobs.
 */
export const PIPELINE_QUEUE_NAME = "pipeline";

/**
 * Job name for run_window jobs.
 */
export const RUN_WINDOW_JOB_NAME = "run_window";

/**
 * Per-run LLM provider override for manual runs.
 */
export interface ProviderOverride {
  provider?: "openai" | "anthropic" | "claude-subscription";
  model?: string;
}

/**
 * Job payload for a pipeline run window.
 */
export interface RunWindowJobData {
  userId: string;
  topicId: string;
  windowStart: string;
  windowEnd: string;
  mode?: BudgetTier | "catch_up";
  /** Optional per-run provider override (for manual runs) */
  providerOverride?: ProviderOverride;
}

/**
 * Parse Redis URL into BullMQ connection options.
 * Supports: redis://[:password@]host:port[/db]
 *           rediss://... (TLS)
 */
export function parseRedisConnection(redisUrl: string): ConnectionOptions {
  const url = new URL(redisUrl);
  const isTls = url.protocol === "rediss:";

  // Extract db from path (e.g., /1 -> db 1)
  const dbMatch = url.pathname.match(/^\/(\d+)$/);
  const db = dbMatch ? Number.parseInt(dbMatch[1], 10) : undefined;

  return {
    host: url.hostname,
    port: Number.parseInt(url.port || "6379", 10),
    password: url.password || undefined,
    db,
    tls: isTls ? {} : undefined,
  };
}

/**
 * Create the pipeline queue.
 * Use this from the scheduler or API to enqueue jobs.
 */
export function createPipelineQueue(redisUrl: string): Queue<RunWindowJobData> {
  return new Queue<RunWindowJobData>(PIPELINE_QUEUE_NAME, {
    connection: parseRedisConnection(redisUrl),
  });
}
