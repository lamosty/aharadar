/**
 * Q&A / "Ask Your Knowledge Base" API endpoint.
 *
 * POST /api/ask - Ask a question about the knowledge base.
 *
 * Experimental feature - off by default via QA_ENABLED=false.
 */

import type { LlmSettingsRow } from "@aharadar/db";
import type { LlmRuntimeConfig } from "@aharadar/llm";
import { computeCreditsStatus, handleAskQuestion } from "@aharadar/pipeline";
import type { AskRequest, AskResponse } from "@aharadar/shared";
import type { FastifyInstance } from "fastify";
import { getDb, getSingletonContext } from "../lib/db.js";

// Rate limiting: track question counts per user
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 10; // 10 requests per minute

/**
 * Check and update rate limit for a user.
 * Returns { allowed: true } if request is allowed, { allowed: false, retryAfterMs } if rate limited.
 */
function checkRateLimit(
  userId: string,
): { allowed: true } | { allowed: false; retryAfterMs: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);

  if (!entry || now >= entry.resetAt) {
    // Start new window
    rateLimitMap.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true };
  }

  if (entry.count >= RATE_LIMIT_MAX_REQUESTS) {
    return { allowed: false, retryAfterMs: entry.resetAt - now };
  }

  entry.count++;
  return { allowed: true };
}

interface AskRequestBody {
  question: string;
  topicId: string;
  options?: {
    timeWindow?: { from?: string; to?: string };
    maxClusters?: number;
    /** Include verbose debug information in response */
    debug?: boolean;
  };
}

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

export async function askRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/ask/status - Check if Q&A feature is enabled on server
  fastify.get("/ask/status", async () => {
    const qaEnabled = process.env.QA_ENABLED === "true";
    return {
      ok: true,
      enabled: qaEnabled,
      limits: {
        maxQuestionLength: 2000,
        maxClusters: { min: 1, max: 50 },
      },
    };
  });

  fastify.post<{ Body: AskRequestBody }>("/ask", async (request, reply) => {
    // Check experimental flag
    const qaEnabled = process.env.QA_ENABLED === "true";
    if (!qaEnabled) {
      return reply.code(403).send({
        ok: false,
        error: {
          code: "FEATURE_DISABLED",
          message: "Q&A feature is not enabled. Set QA_ENABLED=true to enable.",
        },
      });
    }

    // Validate request
    const body = request.body;
    if (!body || typeof body !== "object") {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "INVALID_REQUEST",
          message: "Request body is required",
        },
      });
    }

    const { question, topicId, options } = body;

    // Validation constants
    const MAX_QUESTION_LENGTH = 2000;
    const MIN_MAX_CLUSTERS = 1;
    const MAX_MAX_CLUSTERS = 50;

    if (!question || typeof question !== "string" || question.trim().length === 0) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "INVALID_PARAM",
          message: "question is required and must be a non-empty string",
        },
      });
    }

    if (question.trim().length > MAX_QUESTION_LENGTH) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "INVALID_PARAM",
          message: `question exceeds maximum length of ${MAX_QUESTION_LENGTH} characters`,
        },
      });
    }

    if (!topicId || typeof topicId !== "string") {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "INVALID_PARAM",
          message: "topicId is required",
        },
      });
    }

    // Validate maxClusters if provided
    if (options?.maxClusters !== undefined) {
      const mc = options.maxClusters;
      if (
        typeof mc !== "number" ||
        !Number.isFinite(mc) ||
        mc < MIN_MAX_CLUSTERS ||
        mc > MAX_MAX_CLUSTERS
      ) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: "INVALID_PARAM",
            message: `maxClusters must be a number between ${MIN_MAX_CLUSTERS} and ${MAX_MAX_CLUSTERS}`,
          },
        });
      }
    }

    // Get user context
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

    const db = getDb();

    // Verify topic exists and belongs to user, get topic name for debug
    const topicRes = await db.query<{ id: string; name: string }>(
      `select id::text, name from topics where id = $1::uuid and user_id = $2::uuid`,
      [topicId, ctx.userId],
    );
    if (topicRes.rows.length === 0) {
      return reply.code(404).send({
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: "Topic not found",
        },
      });
    }

    const topicName = topicRes.rows[0].name;

    // Rate limiting check
    const rateLimitResult = checkRateLimit(ctx.userId);
    if (!rateLimitResult.allowed) {
      const retryAfterSec = Math.ceil(rateLimitResult.retryAfterMs / 1000);
      reply.header("Retry-After", String(retryAfterSec));
      return reply.code(429).send({
        ok: false,
        error: {
          code: "RATE_LIMITED",
          message: `Too many requests. Please try again in ${retryAfterSec} seconds.`,
          retryAfterMs: rateLimitResult.retryAfterMs,
        },
      });
    }

    // Budget check - ensure user has credits before making expensive LLM calls
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
          message: "Monthly or daily credit limit reached. Q&A requires available credits.",
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
      const askRequest: AskRequest = {
        question: question.trim(),
        topicId,
        options,
      };

      const llmSettings = await db.llmSettings.get();
      const llmConfig = buildLlmRuntimeConfig(llmSettings);

      const response: AskResponse = await handleAskQuestion({
        db,
        request: askRequest,
        userId: ctx.userId,
        tier: "normal", // Use normal tier for Q&A
        topicName, // Pass topic name for debug info
        llmConfig,
      });

      return {
        ok: true,
        ...response,
      };
    } catch (err) {
      fastify.log.error({ err }, "Q&A error");
      return reply.code(500).send({
        ok: false,
        error: {
          code: "QA_ERROR",
          message: err instanceof Error ? err.message : "Failed to process question",
        },
      });
    }
  });
}
