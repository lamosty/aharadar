import { RUN_AGGREGATE_SUMMARY_JOB_NAME, type RunAggregateSummaryJob } from "@aharadar/queues";
import { type AggregateSummaryScope, computeAggregateSummaryHash } from "@aharadar/shared";
import type { FastifyInstance } from "fastify";
import { getDb, getSingletonContext } from "../lib/db.js";
import { getPipelineQueue } from "../lib/queue.js";

function isValidIsoDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const d = new Date(value);
  return !Number.isNaN(d.getTime());
}

function isValidUuid(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

export async function summariesRoutes(fastify: FastifyInstance): Promise<void> {
  // POST /summaries/digest/:digestId - Create/enqueue aggregate summary for a digest
  fastify.post<{ Params: { digestId: string } }>(
    "/summaries/digest/:digestId",
    async (request, reply) => {
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

      const { digestId } = request.params;
      if (!isValidUuid(digestId)) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: "INVALID_PARAM",
            message: "Invalid digestId: must be UUID",
          },
        });
      }

      const db = getDb();

      // Verify digest exists and belongs to user
      const digestResult = await db.query<{ id: string; user_id: string; topic_id: string }>(
        `SELECT id, user_id, topic_id::text FROM digests WHERE id = $1`,
        [digestId],
      );

      const digest = digestResult.rows[0];
      if (!digest) {
        return reply.code(404).send({
          ok: false,
          error: {
            code: "NOT_FOUND",
            message: "Digest not found",
          },
        });
      }

      if (digest.user_id !== ctx.userId) {
        return reply.code(403).send({
          ok: false,
          error: {
            code: "FORBIDDEN",
            message: "Digest does not belong to current user",
          },
        });
      }

      const topicId = digest.topic_id;

      // Compute scope hash
      const scope: AggregateSummaryScope = {
        type: "digest",
        digestId,
        topicId,
      };
      const scopeHash = computeAggregateSummaryHash(scope);

      // Upsert summary row with pending status
      const summary = await db.aggregateSummaries.upsert({
        userId: ctx.userId,
        scopeType: "digest",
        scopeHash,
        digestId,
        topicId,
        status: "pending",
      });

      // Enqueue job
      try {
        const queue = getPipelineQueue();
        const jobData: RunAggregateSummaryJob = {
          scopeType: "digest",
          scopeHash,
          digestId,
          topicId,
        };
        await queue.add(RUN_AGGREGATE_SUMMARY_JOB_NAME, jobData, {
          jobId: `${scopeHash.slice(0, 16)}_${Date.now()}`,
        });
      } catch (err) {
        // Job enqueueing failed - log but don't fail the request
        // Summary row is already created with pending status
        fastify.log.warn(
          { err: err instanceof Error ? err.message : String(err), digestId },
          "Failed to enqueue aggregate summary job",
        );
      }

      return {
        ok: true,
        summary: {
          id: summary.id,
          status: summary.status,
          scopeType: summary.scope_type,
          scopeHash: summary.scope_hash,
          digestId: summary.digest_id,
          topicId: summary.topic_id,
          createdAt: summary.created_at,
          updatedAt: summary.updated_at,
        },
      };
    },
  );

  // POST /summaries/inbox - Create/enqueue aggregate summary for inbox items
  fastify.post<{ Body: { topicId?: string; since: string; until: string } }>(
    "/summaries/inbox",
    async (request, reply) => {
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

      const { topicId, since, until } = request.body;

      // Validate since/until
      if (!isValidIsoDate(since)) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: "INVALID_PARAM",
            message: "Invalid 'since' parameter: must be ISO date string",
          },
        });
      }

      if (!isValidIsoDate(until)) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: "INVALID_PARAM",
            message: "Invalid 'until' parameter: must be ISO date string",
          },
        });
      }

      if (topicId && !isValidUuid(topicId)) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: "INVALID_PARAM",
            message: "Invalid 'topicId' parameter: must be UUID",
          },
        });
      }

      const db = getDb();

      // Verify topic exists if provided
      if (topicId) {
        const topicResult = await db.query<{ id: string }>(
          `SELECT id FROM topics WHERE id = $1 AND user_id = $2`,
          [topicId, ctx.userId],
        );
        if (!topicResult.rows[0]) {
          return reply.code(404).send({
            ok: false,
            error: {
              code: "NOT_FOUND",
              message: "Topic not found or does not belong to user",
            },
          });
        }
      }

      // Compute scope hash
      const scope: AggregateSummaryScope = {
        type: "inbox",
        topicId: topicId || undefined,
        since,
        until,
      };
      const scopeHash = computeAggregateSummaryHash(scope);

      // Upsert summary row with pending status
      const summary = await db.aggregateSummaries.upsert({
        userId: ctx.userId,
        scopeType: "inbox",
        scopeHash,
        topicId: topicId || undefined,
        status: "pending",
      });

      // Enqueue job
      try {
        const queue = getPipelineQueue();
        const jobData: RunAggregateSummaryJob = {
          scopeType: "inbox",
          scopeHash,
          topicId: topicId || undefined,
          since,
          until,
        };
        await queue.add(RUN_AGGREGATE_SUMMARY_JOB_NAME, jobData, {
          jobId: `${scopeHash.slice(0, 16)}_${Date.now()}`,
        });
      } catch (err) {
        fastify.log.warn(
          { err: err instanceof Error ? err.message : String(err), topicId },
          "Failed to enqueue aggregate summary job",
        );
      }

      return {
        ok: true,
        summary: {
          id: summary.id,
          status: summary.status,
          scopeType: summary.scope_type,
          scopeHash: summary.scope_hash,
          topicId: summary.topic_id,
          createdAt: summary.created_at,
          updatedAt: summary.updated_at,
        },
      };
    },
  );

  // GET /summaries/:id - Get aggregate summary by ID
  fastify.get<{ Params: { id: string } }>("/summaries/:id", async (request, reply) => {
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

    const { id } = request.params;
    if (!isValidUuid(id)) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "INVALID_PARAM",
          message: "Invalid summary ID: must be UUID",
        },
      });
    }

    const db = getDb();
    const summary = await db.aggregateSummaries.getById(id);

    if (!summary) {
      return reply.code(404).send({
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: "Summary not found",
        },
      });
    }

    if (summary.user_id !== ctx.userId) {
      return reply.code(403).send({
        ok: false,
        error: {
          code: "FORBIDDEN",
          message: "Summary does not belong to current user",
        },
      });
    }

    return {
      ok: true,
      summary: {
        id: summary.id,
        status: summary.status,
        scopeType: summary.scope_type,
        scopeHash: summary.scope_hash,
        digestId: summary.digest_id,
        topicId: summary.topic_id,
        summaryJson: summary.summary_json,
        provider: summary.provider,
        model: summary.model,
        inputItemCount: summary.input_item_count,
        inputCharCount: summary.input_char_count,
        inputTokens: summary.input_tokens,
        outputTokens: summary.output_tokens,
        costEstimateCredits: summary.cost_estimate_credits,
        errorMessage: summary.error_message,
        createdAt: summary.created_at,
        updatedAt: summary.updated_at,
      },
    };
  });
}
