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
  RUN_AGGREGATE_SUMMARY_JOB_NAME,
  RUN_CATCHUP_PACK_JOB_NAME,
  type RunAbtestJobData,
  type RunAggregateSummaryJob,
  type RunCatchupPackJobData,
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
      } else if (
        providerOverride.provider === "openai" ||
        providerOverride.provider === "codex-subscription"
      ) {
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
      digest: { deepSummaryEnabled: llmSettings.deep_summary_enabled },
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
 * Handle a run_aggregate_summary job.
 */
async function handleRunAggregateSummaryJob(
  db: Db,
  job: Job<RunAggregateSummaryJob>,
  env: ReturnType<typeof loadRuntimeEnv>,
): Promise<{ status: string }> {
  const jobLog = createJobLogger(job.id ?? "unknown");
  const { scopeType, scopeHash, digestId, topicId, since, until } = job.data;

  jobLog.info(
    {
      scopeType,
      scopeHash: scopeHash.slice(0, 8),
      digestId: digestId?.slice(0, 8),
    },
    "Starting aggregate summary generation",
  );

  try {
    // Import here to avoid circular dependency
    const { generateAggregateSummary } = await import("@aharadar/pipeline");

    // Get the first (and only) user for MVP
    const user = await db.users.getFirstUser();
    if (!user) {
      jobLog.warn("No user found, skipping aggregate summary");
      return { status: "skipped" };
    }

    // Load LLM settings
    const llmSettings = await db.llmSettings.get();
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

    const summary = await generateAggregateSummary({
      db,
      userId: user.id,
      scopeType,
      scopeHash,
      digestId,
      topicId,
      since,
      until,
      tier: "normal",
      llmConfig,
    });

    jobLog.info(
      {
        summaryId: summary.id.slice(0, 8),
        status: summary.status,
      },
      "Aggregate summary generation completed",
    );

    return { status: summary.status };
  } catch (err) {
    jobLog.error(
      {
        err: err instanceof Error ? err.message : String(err),
        scopeType,
        scopeHash: scopeHash.slice(0, 8),
      },
      "Aggregate summary generation failed",
    );
    throw err;
  }
}

/**
 * Handle a run_catchup_pack job.
 */
async function handleRunCatchupPackJob(
  db: Db,
  job: Job<RunCatchupPackJobData>,
  _env: ReturnType<typeof loadRuntimeEnv>,
): Promise<{ status: string }> {
  const jobLog = createJobLogger(job.id ?? "unknown");
  const { userId, topicId, scopeHash, since, until, timeBudgetMinutes } = job.data;

  jobLog.info(
    {
      scopeHash: scopeHash.slice(0, 8),
      topicId: topicId.slice(0, 8),
      timeBudgetMinutes,
    },
    "Starting catch-up pack generation",
  );

  const user = await db.users.getById(userId);
  if (!user) {
    jobLog.warn({ userId: userId.slice(0, 8) }, "User not found, skipping catch-up pack");
    await db.catchupPacks.upsert({
      userId,
      topicId,
      scopeType: "range",
      scopeHash,
      status: "skipped",
      errorMessage: "User not found",
    });
    return { status: "skipped" };
  }

  const topic = await db.topics.getById(topicId);
  if (!topic || topic.user_id !== userId) {
    jobLog.warn({ topicId: topicId.slice(0, 8) }, "Topic not found or not owned by user");
    await db.catchupPacks.upsert({
      userId,
      topicId,
      scopeType: "range",
      scopeHash,
      status: "skipped",
      errorMessage: "Topic not found",
    });
    return { status: "skipped" };
  }

  try {
    // Import here to avoid circular dependency
    const { computeCreditsStatus, generateCatchupPack } = await import("@aharadar/pipeline");

    const monthlyCredits = Number.parseInt(process.env.MONTHLY_CREDITS ?? "10000", 10);
    const dailyThrottleCreditsStr = process.env.DAILY_THROTTLE_CREDITS;
    const dailyThrottleCredits = dailyThrottleCreditsStr
      ? Number.parseInt(dailyThrottleCreditsStr, 10)
      : undefined;

    const creditsStatus = await computeCreditsStatus({
      db,
      userId,
      monthlyCredits,
      dailyThrottleCredits,
      windowEnd: new Date().toISOString(),
    });

    if (!creditsStatus.paidCallsAllowed) {
      await db.catchupPacks.upsert({
        userId,
        topicId,
        scopeType: "range",
        scopeHash,
        status: "skipped",
        errorMessage: "Insufficient credits",
      });
      jobLog.warn(
        { userId: userId.slice(0, 8), scopeHash: scopeHash.slice(0, 8) },
        "Catch-up pack skipped due to insufficient credits",
      );
      return { status: "skipped" };
    }

    const tier = creditsStatus.warningLevel === "critical" ? "low" : "normal";

    const llmSettings = await db.llmSettings.get();
    const llmConfig: LlmRuntimeConfig = {
      provider: llmSettings.provider,
      anthropicModel: llmSettings.anthropic_model,
      openaiModel: llmSettings.openai_model,
      claudeSubscriptionEnabled: llmSettings.claude_subscription_enabled,
      claudeTriageThinking: llmSettings.claude_triage_thinking,
      claudeCallsPerHour: llmSettings.claude_calls_per_hour,
      codexSubscriptionEnabled: llmSettings.codex_subscription_enabled,
      codexCallsPerHour: llmSettings.codex_calls_per_hour,
      reasoningEffort: llmSettings.reasoning_effort,
      triageBatchEnabled: llmSettings.triage_batch_enabled,
      triageBatchSize: llmSettings.triage_batch_size,
    };

    const pack = await generateCatchupPack({
      db,
      userId,
      topicId,
      since,
      until,
      timeBudgetMinutes,
      tier,
      llmConfig,
    });

    jobLog.info(
      { packId: pack.id.slice(0, 8), status: pack.status },
      "Catch-up pack generation completed",
    );

    return { status: pack.status };
  } catch (err) {
    jobLog.error(
      {
        err: err instanceof Error ? err.message : String(err),
        scopeHash: scopeHash.slice(0, 8),
      },
      "Catch-up pack generation failed",
    );
    throw err;
  }
}

/**
 * Create the pipeline worker that processes run_window, run_abtest, and run_aggregate_summary jobs.
 */
export function createPipelineWorker(redisUrl: string): {
  worker: Worker<
    RunWindowJobData | RunAbtestJobData | RunAggregateSummaryJob | RunCatchupPackJobData
  >;
  db: Db;
} {
  const env = loadRuntimeEnv();
  const db = createDb(env.databaseUrl);

  const worker = new Worker<
    RunWindowJobData | RunAbtestJobData | RunAggregateSummaryJob | RunCatchupPackJobData
  >(
    PIPELINE_QUEUE_NAME,
    async (
      job: Job<
        RunWindowJobData | RunAbtestJobData | RunAggregateSummaryJob | RunCatchupPackJobData
      >,
    ) => {
      // Route to appropriate handler based on job name
      if (job.name === RUN_ABTEST_JOB_NAME) {
        return handleRunAbtestJob(db, job as Job<RunAbtestJobData>);
      }
      if (job.name === RUN_AGGREGATE_SUMMARY_JOB_NAME) {
        return handleRunAggregateSummaryJob(db, job as Job<RunAggregateSummaryJob>, env);
      }
      if (job.name === RUN_CATCHUP_PACK_JOB_NAME) {
        return handleRunCatchupPackJob(db, job as Job<RunCatchupPackJobData>, env);
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
