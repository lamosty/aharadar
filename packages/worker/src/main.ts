import { createDb } from "@aharadar/db";
import {
  parseSchedulerConfig,
  generateDueWindows,
  getSchedulableTopics,
} from "@aharadar/pipeline";
import { loadRuntimeEnv } from "@aharadar/shared";

import { createPipelineQueue } from "./queues";
import { createPipelineWorker } from "./workers/pipeline.worker";

/**
 * Scheduler interval in milliseconds.
 * Default: 5 minutes (for MVP; can be configured later).
 */
const SCHEDULER_INTERVAL_MS = 5 * 60 * 1000;

async function runSchedulerTick(
  db: ReturnType<typeof createDb>,
  queue: ReturnType<typeof createPipelineQueue>,
  config: ReturnType<typeof parseSchedulerConfig>
): Promise<void> {
  const topics = await getSchedulableTopics(db);

  if (topics.length === 0) {
    console.log("[scheduler] No topics to schedule");
    return;
  }

  for (const { userId, topicId } of topics) {
    const windows = await generateDueWindows({
      db,
      userId,
      topicId,
      config,
    });

    for (const window of windows) {
      // Use a deterministic job ID to prevent duplicate jobs
      const jobId = `run_window:${userId}:${topicId}:${window.windowStart}:${window.windowEnd}`;

      await queue.add("run_window", window, {
        jobId,
        removeOnComplete: 100, // Keep last 100 completed jobs
        removeOnFail: 50, // Keep last 50 failed jobs
      });

      console.log(
        `[scheduler] Enqueued job ${jobId.slice(0, 60)}... for topic=${topicId.slice(0, 8)}...`
      );
    }
  }
}

async function main(): Promise<void> {
  console.log("[worker] Starting Aha Radar worker...");

  const env = loadRuntimeEnv();
  const schedulerConfig = parseSchedulerConfig();

  console.log(`[worker] Scheduler mode: ${schedulerConfig.windowMode}`);

  // Create DB connection for scheduler
  const schedulerDb = createDb(env.databaseUrl);

  // Create queue for enqueuing jobs
  const queue = createPipelineQueue(env.redisUrl);

  // Create worker to process jobs
  const { worker, db: workerDb } = createPipelineWorker(env.redisUrl);

  console.log("[worker] Worker started, listening for jobs...");

  // Run scheduler immediately on startup
  await runSchedulerTick(schedulerDb, queue, schedulerConfig);

  // Then run scheduler periodically
  const schedulerInterval = setInterval(async () => {
    try {
      await runSchedulerTick(schedulerDb, queue, schedulerConfig);
    } catch (err) {
      console.error("[scheduler] Error during tick:", err);
    }
  }, SCHEDULER_INTERVAL_MS);

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    console.log(`[worker] Received ${signal}, shutting down...`);

    clearInterval(schedulerInterval);

    await worker.close();
    await queue.close();
    await schedulerDb.close();
    await workerDb.close();

    console.log("[worker] Shutdown complete");
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  console.error("[worker] Fatal error:", err);
  process.exit(1);
});
