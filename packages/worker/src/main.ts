import { createDb } from "@aharadar/db";
import { parseSchedulerConfig, generateDueWindows, getSchedulableTopics } from "@aharadar/pipeline";
import { loadDotEnvIfPresent, loadRuntimeEnv, createLogger } from "@aharadar/shared";

import { startMetricsServer, updateQueueDepth } from "./metrics";
import { createPipelineQueue } from "./queues";
import { createPipelineWorker } from "./workers/pipeline.worker";

const METRICS_PORT = parseInt(process.env.WORKER_METRICS_PORT ?? "9091", 10);

// Load .env and .env.local files (must happen before reading env vars)
loadDotEnvIfPresent();

const log = createLogger({ component: "worker" });
const schedulerLog = createLogger({ component: "scheduler" });

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
    schedulerLog.debug("No topics to schedule");
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

      schedulerLog.info({ jobId: jobId.slice(0, 60), topicId: topicId.slice(0, 8) }, "Enqueued job");
    }
  }
}

async function main(): Promise<void> {
  log.info("Starting Aha Radar worker");

  const env = loadRuntimeEnv();
  const schedulerConfig = parseSchedulerConfig();
  const tickIntervalMs = getSchedulerIntervalMs();

  log.info(
    { windowMode: schedulerConfig.windowMode, tickMinutes: tickIntervalMs / 60000 },
    "Scheduler configured"
  );

  // Create DB connection for scheduler
  const schedulerDb = createDb(env.databaseUrl);

  // Create queue for enqueuing jobs
  const queue = createPipelineQueue(env.redisUrl);

  // Create worker to process jobs
  const { worker, db: workerDb } = createPipelineWorker(env.redisUrl);

  // Start metrics server
  const metricsServer = startMetricsServer(METRICS_PORT);
  log.info({ port: METRICS_PORT }, "Metrics server started");

  // Update queue depth periodically
  const queueDepthInterval = setInterval(async () => {
    try {
      const counts = await queue.getJobCounts("waiting", "active", "delayed");
      updateQueueDepth("pipeline", counts.waiting + counts.active + counts.delayed);
    } catch (err) {
      log.warn({ err }, "Failed to update queue depth");
    }
  }, 15_000); // Every 15 seconds

  log.info("Worker started, listening for jobs");

  // Run scheduler immediately on startup
  await runSchedulerTick(schedulerDb, queue, schedulerConfig);

  // Then run scheduler periodically
  const schedulerInterval = setInterval(async () => {
    try {
      await runSchedulerTick(schedulerDb, queue, schedulerConfig);
    } catch (err) {
      schedulerLog.error({ err }, "Error during tick");
    }
  }, tickIntervalMs);

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    log.info({ signal }, "Received signal, shutting down");

    clearInterval(schedulerInterval);
    clearInterval(queueDepthInterval);

    await metricsServer.close();
    await worker.close();
    await queue.close();
    await schedulerDb.close();
    await workerDb.close();

    log.info("Shutdown complete");
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  log.fatal({ err }, "Fatal error");
  process.exit(1);
});
