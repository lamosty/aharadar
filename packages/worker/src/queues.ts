import { Queue } from "bullmq";
import type { BudgetTier } from "@aharadar/shared";

/**
 * Job payload for a pipeline run window.
 */
export interface RunWindowJobData {
  userId: string;
  topicId: string;
  windowStart: string;
  windowEnd: string;
  mode?: BudgetTier | "catch_up";
}

export const PIPELINE_QUEUE_NAME = "pipeline";

/**
 * Create the pipeline queue.
 * Use this from the scheduler to enqueue jobs.
 */
export function createPipelineQueue(redisUrl: string): Queue<RunWindowJobData> {
  const url = new URL(redisUrl);
  return new Queue<RunWindowJobData>(PIPELINE_QUEUE_NAME, {
    connection: {
      host: url.hostname,
      port: Number.parseInt(url.port || "6379", 10),
      password: url.password || undefined,
    },
  });
}
