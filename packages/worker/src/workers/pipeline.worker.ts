import { Worker, type Job } from "bullmq";
import { createDb, type Db } from "@aharadar/db";
import { runPipelineOnce, type PipelineRunResult } from "@aharadar/pipeline";
import { loadRuntimeEnv } from "@aharadar/shared";

import { PIPELINE_QUEUE_NAME, parseRedisConnection, type RunWindowJobData } from "../queues";

/**
 * Log a concise summary of the pipeline run result.
 */
function logSummary(jobId: string | undefined, result: PipelineRunResult): void {
  const ingestTotal = result.ingest.totals.upserted;
  const embedCount = result.embed.embedded;
  const clusterCount = result.cluster.attachedToExisting + result.cluster.created;
  const digestItems = result.digest?.items ?? 0;

  console.log(
    `[pipeline:${jobId}] topic=${result.topicId.slice(0, 8)}... ` +
      `window=${result.windowStart}..${result.windowEnd} ` +
      `ingest=${ingestTotal} embed=${embedCount} cluster=${clusterCount} digest=${digestItems}`
  );
}

/**
 * Create the pipeline worker that processes run_window jobs.
 */
export function createPipelineWorker(redisUrl: string): { worker: Worker<RunWindowJobData>; db: Db } {
  const env = loadRuntimeEnv();
  const db = createDb(env.databaseUrl);

  const worker = new Worker<RunWindowJobData>(
    PIPELINE_QUEUE_NAME,
    async (job: Job<RunWindowJobData>) => {
      const { userId, topicId, windowStart, windowEnd, mode } = job.data;

      console.log(`[pipeline:${job.id}] Starting run for topic=${topicId.slice(0, 8)}...`);

      const result = await runPipelineOnce(db, {
        userId,
        topicId,
        windowStart,
        windowEnd,
        mode,
        budget: {
          monthlyCredits: env.monthlyCredits,
          dailyThrottleCredits: env.dailyThrottleCredits,
        },
      });

      logSummary(job.id, result);

      return result;
    },
    {
      connection: parseRedisConnection(redisUrl),
      concurrency: 1, // Process one pipeline at a time for MVP
    }
  );

  worker.on("failed", (job, err) => {
    console.error(`[pipeline:${job?.id}] Failed:`, err.message);
  });

  worker.on("completed", (job) => {
    console.log(`[pipeline:${job.id}] Completed successfully`);
  });

  return { worker, db };
}
