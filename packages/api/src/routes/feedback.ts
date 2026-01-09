import type { FeedbackAction } from "@aharadar/shared";
import type { FastifyInstance } from "fastify";
import { getDb, getSingletonContext } from "../lib/db.js";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_ACTIONS: FeedbackAction[] = ["like", "dislike", "save", "skip"];
const PROFILE_ACTIONS: FeedbackAction[] = ["like", "dislike", "save"];

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

    // Update preference profile if this is a like/save/dislike action
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
              action: action as "like" | "save" | "dislike",
              embeddingVector: embedding.vector,
            });
          }
        }
      } catch (err) {
        // Log but don't fail the request - preference update is non-critical
        fastify.log.warn({ err, contentItemId, action }, "Failed to update preference profile");
      }
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

      return { ok: true, deleted: deletedCount };
    },
  );
}
