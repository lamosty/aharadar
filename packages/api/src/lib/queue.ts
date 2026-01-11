import {
  createPipelineQueue,
  type RunAbtestJobData,
  type RunWindowJobData,
} from "@aharadar/queues";
import { loadRuntimeEnv } from "@aharadar/shared";
import type { Queue } from "bullmq";

/** Union type for all job types that can be added to the pipeline queue */
type PipelineJobData = RunWindowJobData | RunAbtestJobData;

let pipelineQueue: Queue<PipelineJobData> | null = null;

/**
 * Get the singleton pipeline queue instance.
 * Creates the queue on first call using REDIS_URL from env.
 */
export function getPipelineQueue(): Queue<PipelineJobData> {
  if (!pipelineQueue) {
    const env = loadRuntimeEnv();
    // Cast to union type since createPipelineQueue returns Queue<RunWindowJobData>
    pipelineQueue = createPipelineQueue(env.redisUrl) as Queue<PipelineJobData>;
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
