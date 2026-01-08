import { Worker, type Job } from "bullmq";
import { createDb, type Db } from "@aharadar/db";
import { runPipelineOnce, type PipelineRunResult } from "@aharadar/pipeline";
import { loadRuntimeEnv, createJobLogger, type Logger } from "@aharadar/shared";

import { PIPELINE_QUEUE_NAME, parseRedisConnection, type RunWindowJobData } from "../queues";

/**
 * Log a concise summary of the pipeline run result.
 */
function logSummary(log: Logger, result: PipelineRunResult): void {
  const ingestTotal = result.ingest.totals.upserted;
  const embedCount = result.embed.embedded;
  const clusterCount = result.cluster.attachedToExisting + result.cluster.created;
  const digestItems = result.digest?.items ?? 0;

  log.info(
    {
      topicId: result.topicId.slice(0, 8),
      window: `${result.windowStart}..${result.windowEnd}`,
      ingest: ingestTotal,
      embed: embedCount,
      cluster: clusterCount,
      digest: digestItems,
    },
    "Pipeline run completed"
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
      const jobLog = createJobLogger(job.id ?? "unknown");

      jobLog.info({ topicId: topicId.slice(0, 8) }, "Starting pipeline run");

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

      logSummary(jobLog, result);

      return result;
    },
    {
      connection: parseRedisConnection(redisUrl),
      concurrency: 1, // Process one pipeline at a time for MVP
    }
  );

  worker.on("failed", (job, err) => {
    const jobLog = createJobLogger(job?.id ?? "unknown");
    jobLog.error({ err: err.message }, "Pipeline job failed");
  });

  worker.on("completed", (job) => {
    const jobLog = createJobLogger(job.id ?? "unknown");
    jobLog.info("Pipeline job completed successfully");
  });

  return { worker, db };
}
