import { createDb, type Db } from "@aharadar/db";
import type { LlmRuntimeConfig } from "@aharadar/llm";
import { type PipelineRunResult, runPipelineOnce } from "@aharadar/pipeline";
import { createJobLogger, type Logger, loadRuntimeEnv } from "@aharadar/shared";
import { type Job, Worker } from "bullmq";

import { recordIngestItems, recordPipelineStage } from "../metrics";
import { PIPELINE_QUEUE_NAME, parseRedisConnection, type RunWindowJobData } from "../queues";

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
 * Create the pipeline worker that processes run_window jobs.
 */
export function createPipelineWorker(redisUrl: string): {
  worker: Worker<RunWindowJobData>;
  db: Db;
} {
  const env = loadRuntimeEnv();
  const db = createDb(env.databaseUrl);

  const worker = new Worker<RunWindowJobData>(
    PIPELINE_QUEUE_NAME,
    async (job: Job<RunWindowJobData>) => {
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

        return result;
      } catch (err) {
        const durationSec = Number(process.hrtime.bigint() - startTime) / 1e9;
        recordPipelineStage({ stage: "full", status: "error", durationSec });
        throw err;
      }
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
