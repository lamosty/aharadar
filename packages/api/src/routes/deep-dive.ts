/**
 * Deep Dive / Manual Summary API routes.
 *
 * POST /api/deep-dive/preview - Generate summary from pasted text
 * POST /api/deep-dive/decision - Upsert promote/drop decision
 * GET  /api/deep-dive/queue - Get liked items without decision
 * GET  /api/deep-dive/promoted - Get promoted items with summaries
 */

import type { LlmSettingsRow } from "@aharadar/db";
import { createConfiguredLlmRouter, type LlmRuntimeConfig, manualSummarize } from "@aharadar/llm";
import { computeCreditsStatus } from "@aharadar/pipeline";
import type { ProviderCallDraft } from "@aharadar/shared";
import type { FastifyInstance } from "fastify";
import { getDb, getSingletonContext } from "../lib/db.js";

/**
 * Build LLM runtime config from database settings.
 * Same pattern as ask.ts for consistency.
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
const MAX_PASTED_TEXT_LENGTH = 60_000;

function isValidUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_REGEX.test(value);
}

interface PreviewRequestBody {
  contentItemId: string;
  pastedText: string;
  metadata?: {
    title?: string | null;
    author?: string | null;
    url?: string | null;
    sourceType?: string | null;
  };
}

interface DecisionRequestBody {
  contentItemId: string;
  decision: "promote" | "drop";
  summaryJson?: unknown;
}

interface PaginationQuery {
  limit?: string;
  offset?: string;
}

export async function deepDiveRoutes(fastify: FastifyInstance): Promise<void> {
  // POST /deep-dive/preview - Generate summary from pasted text
  fastify.post<{ Body: PreviewRequestBody }>("/deep-dive/preview", async (request, reply) => {
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

    const { contentItemId, pastedText, metadata } = body as PreviewRequestBody;

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

      // Call manualSummarize
      const result = await manualSummarize({
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
      });

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

      // Persist the summary with status="preview" so it's not lost
      await db.deepReviews.upsertDecision({
        userId: ctx.userId,
        contentItemId,
        status: "preview",
        summaryJson: result.output,
      });

      return {
        ok: true,
        summary: result.output,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        costEstimateCredits: result.costEstimateCredits,
      };
    } catch (err) {
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

  // POST /deep-dive/decision - Upsert promote/drop decision
  fastify.post<{ Body: DecisionRequestBody }>("/deep-dive/decision", async (request, reply) => {
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

    const { contentItemId, decision, summaryJson } = body as DecisionRequestBody;

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

    // Validate decision
    if (decision !== "promote" && decision !== "drop") {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "INVALID_PARAM",
          message: 'decision must be "promote" or "drop"',
        },
      });
    }

    // If promote, require summaryJson
    if (decision === "promote" && !summaryJson) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "INVALID_PARAM",
          message: "summaryJson is required when promoting an item",
        },
      });
    }

    const db = getDb();

    try {
      // Map decision to status
      const status = decision === "promote" ? "promoted" : "dropped";

      await db.deepReviews.upsertDecision({
        userId: ctx.userId,
        contentItemId,
        status,
        summaryJson: decision === "promote" ? summaryJson : undefined,
      });

      return { ok: true };
    } catch (err) {
      fastify.log.error({ err }, "Decision upsert error");
      return reply.code(500).send({
        ok: false,
        error: {
          code: "DECISION_ERROR",
          message: err instanceof Error ? err.message : "Failed to save decision",
        },
      });
    }
  });

  // GET /deep-dive/queue - Get liked items without decision
  fastify.get<{ Querystring: PaginationQuery }>("/deep-dive/queue", async (request, reply) => {
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

    const limitParam = request.query.limit;
    const offsetParam = request.query.offset;

    const limit = limitParam ? Number.parseInt(limitParam, 10) : 50;
    const offset = offsetParam ? Number.parseInt(offsetParam, 10) : 0;

    if (Number.isNaN(limit) || limit < 1 || limit > 100) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "INVALID_PARAM",
          message: "limit must be a number between 1 and 100",
        },
      });
    }

    if (Number.isNaN(offset) || offset < 0) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "INVALID_PARAM",
          message: "offset must be a non-negative number",
        },
      });
    }

    const db = getDb();

    try {
      const items = await db.deepReviews.getQueueForUser({
        userId: ctx.userId,
        limit,
        offset,
      });

      return {
        ok: true,
        items,
        pagination: {
          limit,
          offset,
          count: items.length,
        },
      };
    } catch (err) {
      fastify.log.error({ err }, "Queue fetch error");
      return reply.code(500).send({
        ok: false,
        error: {
          code: "QUEUE_ERROR",
          message: err instanceof Error ? err.message : "Failed to fetch queue",
        },
      });
    }
  });

  // GET /deep-dive/promoted - Get promoted items with summaries
  fastify.get<{ Querystring: PaginationQuery }>("/deep-dive/promoted", async (request, reply) => {
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

    const limitParam = request.query.limit;
    const offsetParam = request.query.offset;

    const limit = limitParam ? Number.parseInt(limitParam, 10) : 50;
    const offset = offsetParam ? Number.parseInt(offsetParam, 10) : 0;

    if (Number.isNaN(limit) || limit < 1 || limit > 100) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "INVALID_PARAM",
          message: "limit must be a number between 1 and 100",
        },
      });
    }

    if (Number.isNaN(offset) || offset < 0) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "INVALID_PARAM",
          message: "offset must be a non-negative number",
        },
      });
    }

    const db = getDb();

    try {
      const items = await db.deepReviews.getPromotedForUser({
        userId: ctx.userId,
        limit,
        offset,
      });

      return {
        ok: true,
        items,
        pagination: {
          limit,
          offset,
          count: items.length,
        },
      };
    } catch (err) {
      fastify.log.error({ err }, "Promoted items fetch error");
      return reply.code(500).send({
        ok: false,
        error: {
          code: "PROMOTED_ERROR",
          message: err instanceof Error ? err.message : "Failed to fetch promoted items",
        },
      });
    }
  });
}
