import { createDb } from "@aharadar/db";
import { checkQuotaForRun, initRedisQuota } from "@aharadar/llm";
import {
  compileDigestPlan,
  generateDueWindows,
  getSchedulableTopics,
  parseSchedulerConfig,
} from "@aharadar/pipeline";
import { clearEmergencyStop, createRedisClient, isEmergencyStopActive } from "@aharadar/queues";
import type { BudgetTier } from "@aharadar/shared";
import { createLogger, loadDotEnvIfPresent, loadRuntimeEnv } from "@aharadar/shared";

import { startMetricsServer, updateHealthStatus, updateQueueDepth } from "./metrics";
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
  config: ReturnType<typeof parseSchedulerConfig>,
): Promise<void> {
  const topics = await getSchedulableTopics(db);

  if (topics.length === 0) {
    schedulerLog.debug("No topics to schedule");
    return;
  }

  // Pre-load LLM settings once per tick for quota checking
  const llmSettings = await db.llmSettings.get();
  const isSubscriptionProvider =
    llmSettings.provider === "claude-subscription" || llmSettings.provider === "codex-subscription";

  for (const { userId, topicId } of topics) {
    const windows = await generateDueWindows({
      db,
      userId,
      topicId,
      config,
    });

    // Pre-flight quota check for subscription providers
    if (isSubscriptionProvider && windows.length > 0) {
      // Load topic for digest settings
      const topic = await db.topics.getById(topicId);
      if (topic) {
        // Count enabled sources for this topic
        const sources = await db.sources.listByUserAndTopic({ userId, topicId });
        const enabledSourceCount = sources.filter(
          (s: { is_enabled: boolean }) => s.is_enabled,
        ).length;

        // Use the first window's mode (they should all be the same)
        const digestPlan = compileDigestPlan({
          mode: windows[0].mode as BudgetTier,
          digestDepth: topic.digest_depth ?? 50,
          enabledSourceCount,
        });

        const quotaCheck = checkQuotaForRun({
          provider: llmSettings.provider,
          expectedCalls: digestPlan.triageMaxCalls,
          claudeCallsPerHour: llmSettings.claude_calls_per_hour,
          codexCallsPerHour: llmSettings.codex_calls_per_hour,
        });

        if (!quotaCheck.ok) {
          schedulerLog.warn(
            {
              topicId: topicId.slice(0, 8),
              provider: llmSettings.provider,
              remainingQuota: quotaCheck.remainingQuota,
              expectedCalls: quotaCheck.expectedCalls,
            },
            "Skipping scheduled windows: insufficient quota",
          );
          continue; // Skip this topic entirely, try again next tick
        }
      }
    }

    for (const window of windows) {
      // Use a deterministic job ID to prevent duplicate jobs
      // BullMQ doesn't allow colons in job IDs, so replace them with underscores
      const sanitizedStart = window.windowStart.replace(/:/g, "_");
      const sanitizedEnd = window.windowEnd.replace(/:/g, "_");
      // Include mode in job ID (per task-123)
      const jobId = `run_window_${userId}_${topicId}_${sanitizedStart}_${sanitizedEnd}_${window.mode}`;

      try {
        await queue.add("run_window", window, {
          jobId,
          removeOnComplete: 100, // Keep last 100 completed jobs
          removeOnFail: 50, // Keep last 50 failed jobs
        });

        schedulerLog.info(
          { jobId: jobId.slice(0, 60), topicId: topicId.slice(0, 8), mode: window.mode },
          "Enqueued job",
        );
      } catch (err) {
        // Handle duplicate job ID gracefully (idempotent tick)
        if (err instanceof Error && err.message.includes("Job with id")) {
          schedulerLog.debug({ jobId: jobId.slice(0, 60) }, "Job already exists (idempotent skip)");
        } else {
          throw err;
        }
      }
    }
  }
}

async function main(): Promise<void> {
  log.info("Starting Aha Radar worker");

  const env = loadRuntimeEnv();
  const schedulerConfig = parseSchedulerConfig();
  const tickIntervalMs = getSchedulerIntervalMs();

  // Record startup time for health endpoint
  const startedAt = new Date().toISOString();
  updateHealthStatus({ startedAt });

  log.info(
    {
      maxBackfillWindows: schedulerConfig.maxBackfillWindows,
      minWindowSeconds: schedulerConfig.minWindowSeconds,
      tickMinutes: tickIntervalMs / 60000,
    },
    "Scheduler configured",
  );

  // Create DB connection for scheduler
  const schedulerDb = createDb(env.databaseUrl);

  // Create queue for enqueuing jobs
  const queue = createPipelineQueue(env.redisUrl);

  // Create worker to process jobs
  const { worker, db: workerDb } = createPipelineWorker(env.redisUrl);

  // Create Redis client for emergency stop checks and quota tracking
  const emergencyStopRedis = createRedisClient(env.redisUrl);

  // Initialize Redis quota tracking for shared state between API and worker
  initRedisQuota(emergencyStopRedis);
  log.info("Redis quota tracking initialized");

  // Clear any stale emergency stop flag on startup
  await clearEmergencyStop(emergencyStopRedis);
  log.info("Emergency stop flag cleared on startup");

  // Start metrics server (also serves /health)
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
  updateHealthStatus({ lastSchedulerTickAt: new Date().toISOString() });

  // Then run scheduler periodically
  const schedulerInterval = setInterval(async () => {
    try {
      await runSchedulerTick(schedulerDb, queue, schedulerConfig);
      updateHealthStatus({ lastSchedulerTickAt: new Date().toISOString() });
    } catch (err) {
      schedulerLog.error({ err }, "Error during tick");
    }
  }, tickIntervalMs);

  // Graceful shutdown
  let isShuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (isShuttingDown) return; // Prevent double shutdown
    isShuttingDown = true;

    log.info({ signal }, "Received signal, shutting down");

    clearInterval(schedulerInterval);
    clearInterval(queueDepthInterval);
    clearInterval(emergencyStopInterval);

    await metricsServer.close();
    await worker.close();
    await queue.close();
    await emergencyStopRedis.quit();
    await schedulerDb.close();
    await workerDb.close();

    log.info("Shutdown complete");
    process.exit(0);
  };

  // Poll for emergency stop flag every 2 seconds
  const emergencyStopInterval = setInterval(async () => {
    try {
      const shouldStop = await isEmergencyStopActive(emergencyStopRedis);
      if (shouldStop) {
        log.warn("Emergency stop flag detected! Shutting down worker...");
        await shutdown("EMERGENCY_STOP");
      }
    } catch (err) {
      log.warn({ err }, "Failed to check emergency stop flag");
    }
  }, 2000);

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  log.fatal({ err }, "Fatal error");
  process.exit(1);
});
