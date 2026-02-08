/**
 * Item Summaries API routes.
 *
 * POST /api/item-summaries - Generate and save summary from pasted text
 */

import type { LlmSettingsRow } from "@aharadar/db";
import {
  createConfiguredLlmRouter,
  type LlmRuntimeConfig,
  manualSummarize,
  TimeoutError,
  withTimeout,
} from "@aharadar/llm";
import { computeCreditsStatus } from "@aharadar/pipeline";
import { type ProviderCallDraft, parseAiGuidance } from "@aharadar/shared";
import type { FastifyInstance } from "fastify";
import { getDb, getSingletonContext } from "../lib/db.js";

/**
 * Build LLM runtime config from database settings.
 */
function buildLlmRuntimeConfig(settings: LlmSettingsRow): LlmRuntimeConfig {
  return {
    provider: settings.provider,
    anthropicModel: settings.anthropic_model,
    openaiModel: settings.openai_model,
    claudeSubscriptionEnabled: settings.claude_subscription_enabled,
    claudeTriageThinking: settings.claude_triage_thinking,
    claudeCallsPerHour: settings.claude_calls_per_hour,
    codexSubscriptionEnabled: settings.codex_subscription_enabled,
    codexCallsPerHour: settings.codex_calls_per_hour,
    reasoningEffort: settings.reasoning_effort,
    triageBatchEnabled: settings.triage_batch_enabled,
    triageBatchSize: settings.triage_batch_size,
  };
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PASTED_TEXT_LENGTH = 100_000;
const AUTH_ERROR_PATTERNS: RegExp[] = [
  /could not resolve authentication method/i,
  /expected either apikey or authtoken to be set/i,
  /invalid api key/i,
  /api key.*required/i,
  /authentication failed/i,
  /unauthorized/i,
  /not logged in/i,
  /please run .*login/i,
  /login required/i,
];

function isValidUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_REGEX.test(value);
}

function isLlmAuthError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: unknown }).code;
  if (code === "LLM_AUTH_ERROR") return true;
  const message = (err as { message?: unknown }).message;
  if (typeof message !== "string") return false;
  return AUTH_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

interface ItemSummaryRequestBody {
  contentItemId: string;
  pastedText: string;
  metadata?: {
    title?: string | null;
    author?: string | null;
    url?: string | null;
    sourceType?: string | null;
  };
}

export async function itemSummariesRoutes(fastify: FastifyInstance): Promise<void> {
  // POST /item-summaries - Generate and save summary from pasted text
  fastify.post<{ Body: ItemSummaryRequestBody }>("/item-summaries", async (request, reply) => {
    const ctx = await getSingletonContext();
    if (!ctx) {
      return reply.code(503).send({
        ok: false,
        error: {
          code: "NOT_INITIALIZED",
          message: "Database not initialized: no user or topic found",
        },
      });
    }

    const body = request.body as unknown;
    if (!body || typeof body !== "object") {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "INVALID_BODY",
          message: "Request body must be a JSON object",
        },
      });
    }

    const { contentItemId, pastedText, metadata } = body as ItemSummaryRequestBody;

    // Validate contentItemId
    if (!isValidUuid(contentItemId)) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "INVALID_PARAM",
          message: "contentItemId must be a valid UUID",
        },
      });
    }

    // Validate pastedText
    if (!pastedText || typeof pastedText !== "string" || pastedText.trim().length === 0) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "INVALID_PARAM",
          message: "pastedText is required and must be a non-empty string",
        },
      });
    }

    if (pastedText.length > MAX_PASTED_TEXT_LENGTH) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "INVALID_PARAM",
          message: `pastedText exceeds maximum length of ${MAX_PASTED_TEXT_LENGTH} characters`,
        },
      });
    }

    const db = getDb();

    // Budget check - ensure user has credits before making LLM call
    const monthlyCredits = Number.parseInt(process.env.MONTHLY_CREDITS ?? "10000", 10);
    const dailyThrottleCreditsStr = process.env.DAILY_THROTTLE_CREDITS;
    const dailyThrottleCredits = dailyThrottleCreditsStr
      ? Number.parseInt(dailyThrottleCreditsStr, 10)
      : undefined;

    const creditsStatus = await computeCreditsStatus({
      db,
      userId: ctx.userId,
      monthlyCredits,
      dailyThrottleCredits,
      windowEnd: new Date().toISOString(),
    });

    if (!creditsStatus.paidCallsAllowed) {
      return reply.code(402).send({
        ok: false,
        error: {
          code: "INSUFFICIENT_CREDITS",
          message:
            "Monthly or daily credit limit reached. Manual summary requires available credits.",
          budgets: {
            monthlyUsed: creditsStatus.monthlyUsed,
            monthlyLimit: creditsStatus.monthlyLimit,
            monthlyRemaining: creditsStatus.monthlyRemaining,
            dailyUsed: creditsStatus.dailyUsed,
            dailyLimit: creditsStatus.dailyLimit,
            dailyRemaining: creditsStatus.dailyRemaining,
          },
        },
      });
    }

    try {
      const startedAt = new Date().toISOString();

      // Fetch user's LLM settings and create configured router
      const llmSettings = await db.llmSettings.get();
      const llmConfig = buildLlmRuntimeConfig(llmSettings);
      const router = createConfiguredLlmRouter(process.env, llmConfig);

      // Fetch AI guidance from the content item's topic
      let aiGuidance: string | undefined;
      const contentItem = await db.query<{ topic_id: string }>(
        `SELECT s.topic_id FROM content_items ci
         JOIN sources s ON ci.source_id = s.id
         WHERE ci.id = $1`,
        [contentItemId],
      );
      if (contentItem.rows.length > 0) {
        const topicId = contentItem.rows[0].topic_id;
        const topic = await db.topics.getById(topicId);
        if (topic) {
          const guidance = parseAiGuidance(topic.custom_settings?.ai_guidance_v1);
          aiGuidance = guidance.summary_prompt || undefined;
        }
      }

      // Call manualSummarize
      const timeoutMs = Number.parseInt(process.env.MANUAL_SUMMARY_TIMEOUT_MS ?? "120000", 10);
      const result = await withTimeout(
        manualSummarize({
          router,
          tier: "normal",
          input: {
            pastedText: pastedText.trim(),
            metadata: {
              title: metadata?.title ?? null,
              author: metadata?.author ?? null,
              url: metadata?.url ?? null,
              sourceType: metadata?.sourceType ?? null,
            },
          },
          aiGuidance,
        }),
        Number.isFinite(timeoutMs) ? timeoutMs : 120000,
        "manualSummarize",
      );

      const endedAt = new Date().toISOString();

      // Log to provider_calls
      const providerCallDraft: ProviderCallDraft = {
        userId: ctx.userId,
        purpose: "manual_summary",
        provider: result.provider,
        model: result.model,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        costEstimateCredits: result.costEstimateCredits,
        meta: {
          endpoint: result.endpoint,
          hasTitle: !!metadata?.title,
          hasUrl: !!metadata?.url,
          inputLength: pastedText.length,
        },
        startedAt,
        endedAt,
        status: "ok",
      };

      await db.providerCalls.insert(providerCallDraft);

      // Save summary immediately (no preview/promote flow)
      await db.itemSummaries.upsertSummary({
        userId: ctx.userId,
        contentItemId,
        summaryJson: result.output,
        source: "manual_paste",
      });

      return {
        ok: true,
        summary: result.output,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        costEstimateCredits: result.costEstimateCredits,
      };
    } catch (err) {
      if (err instanceof TimeoutError) {
        return reply.code(504).send({
          ok: false,
          error: {
            code: "LLM_TIMEOUT",
            message: `LLM timed out after ${err.timeoutMs}ms (${err.label}). Try again, or switch providers/models in settings.`,
          },
        });
      }
      if (isLlmAuthError(err)) {
        return reply.code(503).send({
          ok: false,
          error: {
            code: "LLM_AUTH_ERROR",
            message:
              "LLM authentication failed. Re-login for the selected provider or switch to an API-key provider in Settings.",
          },
        });
      }
      fastify.log.error({ err }, "Manual summary error");
      return reply.code(500).send({
        ok: false,
        error: {
          code: "SUMMARY_ERROR",
          message: err instanceof Error ? err.message : "Failed to generate summary",
        },
      });
    }
  });
}
