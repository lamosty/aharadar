/**
 * Q&A / "Ask Your Knowledge Base" API endpoint.
 *
 * POST /api/ask - Ask a question about the knowledge base.
 *
 * Experimental feature - off by default via QA_ENABLED=false.
 */

import type { FastifyInstance } from "fastify";
import { handleAskQuestion } from "@aharadar/pipeline";
import type { AskRequest, AskResponse } from "@aharadar/shared";
import { getDb, getSingletonContext } from "../lib/db.js";

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
      if (typeof mc !== "number" || !Number.isFinite(mc) || mc < MIN_MAX_CLUSTERS || mc > MAX_MAX_CLUSTERS) {
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
      [topicId, ctx.userId]
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

    try {
      const askRequest: AskRequest = {
        question: question.trim(),
        topicId,
        options,
      };

      const response: AskResponse = await handleAskQuestion({
        db,
        request: askRequest,
        userId: ctx.userId,
        tier: "normal", // Use normal tier for Q&A
        topicName, // Pass topic name for debug info
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
