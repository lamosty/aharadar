import { createPipelineQueue, type RunWindowJobData } from "@aharadar/queues";
import { loadRuntimeEnv } from "@aharadar/shared";
import type { Queue } from "bullmq";

let pipelineQueue: Queue<RunWindowJobData> | null = null;

/**
 * Get the singleton pipeline queue instance.
 * Creates the queue on first call using REDIS_URL from env.
 */
export function getPipelineQueue(): Queue<RunWindowJobData> {
  if (!pipelineQueue) {
    const env = loadRuntimeEnv();
    pipelineQueue = createPipelineQueue(env.redisUrl);
  }
  return pipelineQueue;
}

/**
 * Close the pipeline queue connection.
 * Call this on server shutdown.
 */
export async function closePipelineQueue(): Promise<void> {
  if (pipelineQueue) {
    await pipelineQueue.close();
    pipelineQueue = null;
  }
}
