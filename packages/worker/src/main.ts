import { createDb } from "@aharadar/db";
import { parseSchedulerConfig, generateDueWindows, getSchedulableTopics } from "@aharadar/pipeline";
import { loadDotEnvIfPresent, loadRuntimeEnv } from "@aharadar/shared";

import { createPipelineQueue } from "./queues";
import { createPipelineWorker } from "./workers/pipeline.worker";

// Load .env and .env.local files (must happen before reading env vars)
loadDotEnvIfPresent();

/**
 * Parse scheduler tick interval from env.
 * Default: 5 minutes.
 */
function getSchedulerIntervalMs(): number {
  const raw = process.env.SCHEDULER_TICK_MINUTES;
  if (raw) {
    const minutes = Number.parseFloat(raw);
    if (Number.isFinite(minutes) && minutes > 0) {
      return minutes * 60 * 1000;
    }
  }
  return 5 * 60 * 1000; // default 5 min
}

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
      // BullMQ doesn't allow colons in job IDs, so replace them with underscores
      const sanitizedStart = window.windowStart.replace(/:/g, "_");
      const sanitizedEnd = window.windowEnd.replace(/:/g, "_");
      const jobId = `run_window_${userId}_${topicId}_${sanitizedStart}_${sanitizedEnd}`;

      await queue.add("run_window", window, {
        jobId,
        removeOnComplete: 100, // Keep last 100 completed jobs
        removeOnFail: 50, // Keep last 50 failed jobs
      });

      console.log(`[scheduler] Enqueued job ${jobId.slice(0, 60)}... for topic=${topicId.slice(0, 8)}...`);
    }
  }
}

async function main(): Promise<void> {
  console.log("[worker] Starting Aha Radar worker...");

  const env = loadRuntimeEnv();
  const schedulerConfig = parseSchedulerConfig();
  const tickIntervalMs = getSchedulerIntervalMs();

  console.log(`[worker] Scheduler mode: ${schedulerConfig.windowMode}, tick: ${tickIntervalMs / 60000}min`);

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
  }, tickIntervalMs);

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
