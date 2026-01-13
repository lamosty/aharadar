import type { BudgetTier } from "@aharadar/shared";
import type { ConnectionOptions } from "bullmq";
import { Queue } from "bullmq";
import Redis from "ioredis";

/**
 * Queue name for pipeline jobs.
 */
export const PIPELINE_QUEUE_NAME = "pipeline";

/**
 * Job name for run_window jobs.
 */
export const RUN_WINDOW_JOB_NAME = "run_window";

/**
 * Job name for AB test jobs.
 */
export const RUN_ABTEST_JOB_NAME = "run_abtest";

/**
 * Job name for aggregate summary jobs.
 */
export const RUN_AGGREGATE_SUMMARY_JOB_NAME = "run_aggregate_summary";

/**
 * Per-run LLM provider override for manual runs.
 */
export interface ProviderOverride {
  provider?: "openai" | "anthropic" | "claude-subscription" | "codex-subscription";
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
  // catch_up mode removed per task-121; now uses only BudgetTier values
  mode?: BudgetTier;
  /** Trigger source: scheduled (by scheduler tick) or manual (admin run) */
  trigger?: "scheduled" | "manual";
  /** Optional per-run provider override (for manual runs) */
  providerOverride?: ProviderOverride;
}

/**
 * AB test variant configuration.
 */
export interface AbtestVariantConfig {
  name: string;
  provider: "openai" | "anthropic" | "claude-subscription" | "codex-subscription";
  model: string;
  reasoningEffort?: "none" | "low" | "medium" | "high" | null;
  maxOutputTokens?: number;
}

/**
 * Job payload for AB test runs.
 */
export interface RunAbtestJobData {
  runId: string;
  userId: string;
  topicId: string;
  windowStart: string;
  windowEnd: string;
  variants: AbtestVariantConfig[];
  /** Max items to sample for testing */
  maxItems?: number;
}

/**
 * Job payload for aggregate summary runs.
 */
export interface RunAggregateSummaryJob {
  scopeType: "digest" | "inbox" | "range" | "custom";
  scopeHash: string;
  digestId?: string;
  topicId?: string;
  since?: string;
  until?: string;
  view?: string;
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

// ============================================================================
// Emergency Stop (Kill Switch)
// ============================================================================

const EMERGENCY_STOP_KEY = "pipeline:emergency_stop";

/**
 * Create a Redis client for emergency stop operations.
 */
export function createRedisClient(redisUrl: string): Redis {
  // Parse the URL directly for ioredis
  const url = new URL(redisUrl);
  const isTls = url.protocol === "rediss:";
  const dbMatch = url.pathname.match(/^\/(\d+)$/);
  const db = dbMatch ? Number.parseInt(dbMatch[1], 10) : undefined;

  return new Redis({
    host: url.hostname,
    port: Number.parseInt(url.port || "6379", 10),
    password: url.password || undefined,
    db,
    tls: isTls ? {} : undefined,
  });
}

/**
 * Set the emergency stop flag.
 * When set, workers should stop processing and exit.
 */
export async function setEmergencyStop(redis: Redis): Promise<void> {
  await redis.set(EMERGENCY_STOP_KEY, "1");
}

/**
 * Clear the emergency stop flag.
 */
export async function clearEmergencyStop(redis: Redis): Promise<void> {
  await redis.del(EMERGENCY_STOP_KEY);
}

/**
 * Check if emergency stop is active.
 */
export async function isEmergencyStopActive(redis: Redis): Promise<boolean> {
  const value = await redis.get(EMERGENCY_STOP_KEY);
  return value === "1";
}
