import { createDb, type Db } from "@aharadar/db";
import type { LlmRuntimeConfig } from "@aharadar/llm";
import { type PipelineRunResult, runAbtestOnce, runPipelineOnce } from "@aharadar/pipeline";
import { createJobLogger, createLogger, type Logger, loadRuntimeEnv } from "@aharadar/shared";
import { type Job, Worker } from "bullmq";

import { recordIngestItems, recordPipelineStage } from "../metrics";
import {
  PIPELINE_QUEUE_NAME,
  parseRedisConnection,
  RUN_ABTEST_JOB_NAME,
  RUN_WINDOW_JOB_NAME,
  type RunAbtestJobData,
  type RunWindowJobData,
} from "../queues";

const cursorLog = createLogger({ component: "cursor" });

/**
 * Log a concise summary and record metrics for the pipeline run result.
 */
function logSummaryAndRecordMetrics(
  log: Logger,
  result: PipelineRunResult,
  durationSec: number,
): void {
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
      durationSec,
    },
    "Pipeline run completed",
  );

  // Record pipeline metrics
  recordPipelineStage({ stage: "full", status: "success", durationSec });

  // Record ingest metrics per source type
  for (const source of result.ingest.perSource) {
    const status =
      source.status === "ok" ? "success" : source.status === "skipped" ? "skipped" : "error";
    recordIngestItems({
      sourceType: source.sourceType,
      status,
      count: source.upserted,
    });
  }
}

/**
 * Check if AB tests are enabled via environment variable.
 */
function isAbtestsEnabled(): boolean {
  const value = process.env.ENABLE_ABTESTS;
  return value === "true" || value === "1";
}

/**
 * Handle a run_window job.
 */
async function handleRunWindowJob(
  db: Db,
  job: Job<RunWindowJobData>,
  env: ReturnType<typeof loadRuntimeEnv>,
): Promise<PipelineRunResult> {
  const { userId, topicId, windowStart, windowEnd, mode, providerOverride } = job.data;
  const jobLog = createJobLogger(job.id ?? "unknown");
  const startTime = process.hrtime.bigint();

  jobLog.info({ topicId: topicId.slice(0, 8) }, "Starting pipeline run");

  try {
    // Load LLM settings from DB
    const llmSettings = await db.llmSettings.get();

    // Build runtime config from DB settings
    const llmConfig: LlmRuntimeConfig = {
      provider: llmSettings.provider,
      anthropicModel: llmSettings.anthropic_model,
      openaiModel: llmSettings.openai_model,
      claudeSubscriptionEnabled: llmSettings.claude_subscription_enabled,
      claudeTriageThinking: llmSettings.claude_triage_thinking,
      claudeCallsPerHour: llmSettings.claude_calls_per_hour,
      reasoningEffort: llmSettings.reasoning_effort,
      triageBatchEnabled: llmSettings.triage_batch_enabled,
      triageBatchSize: llmSettings.triage_batch_size,
    };

    // Apply per-run override if present (for manual runs)
    if (providerOverride?.provider) {
      llmConfig.provider = providerOverride.provider;
    }
    if (providerOverride?.model) {
      if (
        providerOverride.provider === "anthropic" ||
        providerOverride.provider === "claude-subscription"
      ) {
        llmConfig.anthropicModel = providerOverride.model;
      } else if (providerOverride.provider === "openai") {
        llmConfig.openaiModel = providerOverride.model;
      }
    }

    jobLog.info(
      {
        provider: llmConfig.provider,
        model: llmConfig.anthropicModel || llmConfig.openaiModel,
      },
      "Using LLM config",
    );

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
      llmConfig,
    });

    const durationSec = Number(process.hrtime.bigint() - startTime) / 1e9;
    logSummaryAndRecordMetrics(jobLog, result, durationSec);

    // Update cursor only for scheduled runs (not manual/admin runs)
    // This must happen even if digest was skipped due to credits exhaustion
    // to prevent the scheduler from re-enqueuing the same window
    if (job.data.trigger === "scheduled") {
      try {
        await db.topics.updateDigestCursorEnd(topicId, windowEnd);
        cursorLog.debug(
          { topicId: topicId.slice(0, 8), cursorEnd: windowEnd },
          "Updated digest cursor",
        );
      } catch (err) {
        cursorLog.warn({ topicId: topicId.slice(0, 8), err }, "Failed to update digest cursor");
        // Don't fail the job - cursor update is best-effort
      }
    }

    return result;
  } catch (err) {
    const durationSec = Number(process.hrtime.bigint() - startTime) / 1e9;
    recordPipelineStage({ stage: "full", status: "error", durationSec });
    throw err;
  }
}

/**
 * Handle a run_abtest job.
 */
async function handleRunAbtestJob(
  db: Db,
  job: Job<RunAbtestJobData>,
): Promise<{ runId: string; status: string }> {
  const jobLog = createJobLogger(job.id ?? "unknown");

  // Check if AB tests are enabled
  if (!isAbtestsEnabled()) {
    jobLog.error("AB tests are disabled (ENABLE_ABTESTS not set)");
    throw new Error("AB tests are disabled. Set ENABLE_ABTESTS=true to enable.");
  }

  const { runId, userId, topicId, windowStart, windowEnd, variants, maxItems } = job.data;

  jobLog.info({ runId: runId.slice(0, 8), topicId: topicId.slice(0, 8) }, "Starting AB test run");

  const result = await runAbtestOnce(db, {
    runId,
    userId,
    topicId,
    windowStart,
    windowEnd,
    variants,
    maxItems,
  });

  if (result.status === "failed") {
    throw new Error(result.error ?? "AB test failed");
  }

  jobLog.info(
    { runId: runId.slice(0, 8), items: result.itemCount, results: result.resultCount },
    "AB test run completed",
  );

  return { runId: result.runId, status: result.status };
}

/**
 * Create the pipeline worker that processes run_window and run_abtest jobs.
 */
export function createPipelineWorker(redisUrl: string): {
  worker: Worker<RunWindowJobData | RunAbtestJobData>;
  db: Db;
} {
  const env = loadRuntimeEnv();
  const db = createDb(env.databaseUrl);

  const worker = new Worker<RunWindowJobData | RunAbtestJobData>(
    PIPELINE_QUEUE_NAME,
    async (job: Job<RunWindowJobData | RunAbtestJobData>) => {
      // Route to appropriate handler based on job name
      if (job.name === RUN_ABTEST_JOB_NAME) {
        return handleRunAbtestJob(db, job as Job<RunAbtestJobData>);
      }
      // Default to run_window job (for backwards compatibility)
      return handleRunWindowJob(db, job as Job<RunWindowJobData>, env);
    },
    {
      connection: parseRedisConnection(redisUrl),
      concurrency: 1, // Process one pipeline at a time for MVP
    },
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
