import type {
  FeedbackAction,
  FeedbackByTopicResponse,
  FeedbackDailyStatsResponse,
  FeedbackSummaryResponse,
  XAccountFeedbackAction,
} from "@aharadar/shared";
import { normalizeHandle } from "@aharadar/shared";
import type { FastifyInstance } from "fastify";
import { getDb, getSingletonContext } from "../lib/db.js";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_ACTIONS: FeedbackAction[] = ["like", "dislike", "skip"];
const PROFILE_ACTIONS: FeedbackAction[] = ["like", "dislike"];

function isValidUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_REGEX.test(value);
}

function isValidAction(value: unknown): value is FeedbackAction {
  return typeof value === "string" && VALID_ACTIONS.includes(value as FeedbackAction);
}

interface FeedbackRequestBody {
  contentItemId: string;
  digestId?: string;
  action: FeedbackAction;
}

export async function feedbackRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Body: FeedbackRequestBody }>("/feedback", async (request, reply) => {
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

    const { contentItemId, digestId, action } = body as Record<string, unknown>;

    if (!isValidUuid(contentItemId)) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "INVALID_PARAM",
          message: "contentItemId must be a valid UUID",
        },
      });
    }

    if (digestId !== undefined && digestId !== null && !isValidUuid(digestId)) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "INVALID_PARAM",
          message: "digestId must be a valid UUID if provided",
        },
      });
    }

    if (!isValidAction(action)) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "INVALID_PARAM",
          message: `action must be one of: ${VALID_ACTIONS.join(", ")}`,
        },
      });
    }

    const db = getDb();
    await db.feedbackEvents.insert({
      userId: ctx.userId,
      digestId: isValidUuid(digestId) ? digestId : null,
      contentItemId,
      action,
    });

    // Update preference profile if this is a like/dislike action
    if (PROFILE_ACTIONS.includes(action)) {
      try {
        // Get the topic_id for this content item via content_item_sources -> sources
        const topicRes = await db.query<{ topic_id: string }>(
          `select distinct s.topic_id::text as topic_id
           from content_item_sources cis
           join sources s on s.id = cis.source_id
           where cis.content_item_id = $1::uuid
           limit 1`,
          [contentItemId],
        );
        const topicRow = topicRes.rows[0];

        if (topicRow) {
          // Get the embedding for this content item
          const embedding = await db.embeddings.getByContentItemId(contentItemId);

          if (embedding) {
            // Apply the feedback to the preference profile
            await db.topicPreferenceProfiles.applyFeedbackEmbedding({
              userId: ctx.userId,
              topicId: topicRow.topic_id,
              action: action as "like" | "dislike",
              embeddingVector: embedding.vector,
            });
          }
        }
      } catch (err) {
        // Log but don't fail the request - preference update is non-critical
        fastify.log.warn({ err, contentItemId, action }, "Failed to update preference profile");
      }
    }

    // Update source calibrations for like/dislike feedback
    if (PROFILE_ACTIONS.includes(action)) {
      try {
        // Get all source_ids for this content item
        const sourceRes = await db.query<{ source_id: string }>(
          `SELECT cis.source_id::text as source_id
           FROM content_item_sources cis
           WHERE cis.content_item_id = $1::uuid`,
          [contentItemId],
        );

        for (const row of sourceRes.rows) {
          await db.sourceCalibrations.updateOnFeedback({
            userId: ctx.userId,
            sourceId: row.source_id,
            action: action as "like" | "dislike",
          });
        }
      } catch (err) {
        // Log but don't fail - calibration update is non-critical
        fastify.log.warn({ err, contentItemId, action }, "Failed to update source calibrations");
      }
    }

    // Update X account policy if this is an x_posts item
    try {
      // Get content item to check source_type and author
      const itemRes = await db.query<{
        source_type: string;
        author: string | null;
      }>(`SELECT source_type, author FROM content_items WHERE id = $1::uuid`, [contentItemId]);
      const item = itemRes.rows[0];

      if (item && item.source_type === "x_posts" && item.author) {
        // Extract handle from author (e.g., "@elonmusk" -> "elonmusk")
        const handle = normalizeHandle(item.author);

        if (handle) {
          // Get all x_posts source_ids for this content item
          const sourceRes = await db.query<{ source_id: string }>(
            `SELECT cis.source_id::text as source_id
             FROM content_item_sources cis
             JOIN sources s ON s.id = cis.source_id
             WHERE cis.content_item_id = $1::uuid
               AND s.type = 'x_posts'`,
            [contentItemId],
          );

          const occurredAt = new Date();

          // Apply feedback to each source's policy
          for (const row of sourceRes.rows) {
            await db.xAccountPolicies.applyFeedback({
              sourceId: row.source_id,
              handle,
              action: action as XAccountFeedbackAction,
              occurredAt,
            });
          }
        }
      }
    } catch (err) {
      // Log but don't fail - policy update is non-critical
      fastify.log.warn({ err, contentItemId, action }, "Failed to update X account policy");
    }

    return { ok: true };
  });

  // DELETE /feedback - Clear feedback for a content item (undo)
  fastify.delete<{ Body: { contentItemId: string; digestId?: string } }>(
    "/feedback",
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

      const { contentItemId, digestId } = body as Record<string, unknown>;

      if (!isValidUuid(contentItemId)) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: "INVALID_PARAM",
            message: "contentItemId must be a valid UUID",
          },
        });
      }

      if (digestId !== undefined && digestId !== null && !isValidUuid(digestId)) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: "INVALID_PARAM",
            message: "digestId must be a valid UUID if provided",
          },
        });
      }

      const db = getDb();

      // Delete feedback for this item
      const deletedCount = await db.feedbackEvents.deleteByContentItem({
        userId: ctx.userId,
        contentItemId,
      });

      // Rebuild preference profile for the topic(s) containing this item
      try {
        const topicRes = await db.query<{ topic_id: string }>(
          `select distinct s.topic_id::text as topic_id
           from content_item_sources cis
           join sources s on s.id = cis.source_id
           where cis.content_item_id = $1::uuid`,
          [contentItemId],
        );

        for (const row of topicRes.rows) {
          await db.topicPreferenceProfiles.rebuildFromFeedback({
            userId: ctx.userId,
            topicId: row.topic_id,
          });
        }
      } catch (err) {
        // Log but don't fail - preference rebuild is non-critical
        fastify.log.warn(
          { err, contentItemId },
          "Failed to rebuild preference profile after feedback clear",
        );
      }

      // Recompute X account policy if this was an x_posts item
      try {
        const itemRes = await db.query<{
          source_type: string;
          author: string | null;
        }>(`SELECT source_type, author FROM content_items WHERE id = $1::uuid`, [contentItemId]);
        const item = itemRes.rows[0];

        if (item && item.source_type === "x_posts" && item.author) {
          const handle = normalizeHandle(item.author);

          if (handle) {
            // Get all x_posts source_ids for this content item
            const sourceRes = await db.query<{ source_id: string }>(
              `SELECT cis.source_id::text as source_id
               FROM content_item_sources cis
               JOIN sources s ON s.id = cis.source_id
               WHERE cis.content_item_id = $1::uuid
                 AND s.type = 'x_posts'`,
              [contentItemId],
            );

            const now = new Date();

            // Recompute policy from remaining feedback for each source
            for (const row of sourceRes.rows) {
              await db.xAccountPolicies.recomputeFromFeedback({
                sourceId: row.source_id,
                handle,
                now,
              });
            }
          }
        }
      } catch (err) {
        // Log but don't fail - policy recompute is non-critical
        fastify.log.warn(
          { err, contentItemId },
          "Failed to recompute X account policy after feedback clear",
        );
      }

      return { ok: true, deleted: deletedCount };
    },
  );

  // ============================================================
  // Feedback Statistics Endpoints (for dashboard analytics)
  // ============================================================

  // GET /feedback/stats/daily - Daily feedback breakdown for charts
  fastify.get<{ Querystring: { days?: string } }>(
    "/feedback/stats/daily",
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

      const daysParam = request.query.days;
      const days = daysParam ? parseInt(daysParam, 10) : 30;

      if (Number.isNaN(days) || days < 1 || days > 365) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: "INVALID_PARAM",
            message: "days must be a number between 1 and 365",
          },
        });
      }

      const db = getDb();
      const daily = await db.feedbackEvents.getDailyStats({ userId: ctx.userId, days });

      return { ok: true, daily } as FeedbackDailyStatsResponse;
    },
  );

  // GET /feedback/stats/summary - Total feedback counts and quality ratio
  fastify.get("/feedback/stats/summary", async (request, reply) => {
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
    const summary = await db.feedbackEvents.getSummary({ userId: ctx.userId });

    return { ok: true, summary } as FeedbackSummaryResponse;
  });

  // GET /feedback/stats/by-topic - Feedback breakdown per topic
  fastify.get("/feedback/stats/by-topic", async (request, reply) => {
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
    const topics = await db.feedbackEvents.getByTopic({ userId: ctx.userId });

    return { ok: true, topics } as FeedbackByTopicResponse;
  });
}
