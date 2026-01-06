import type { FastifyInstance } from "fastify";
import type { FeedbackAction } from "@aharadar/shared";
import { getDb, getSingletonContext } from "../lib/db.js";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_ACTIONS: FeedbackAction[] = ["like", "dislike", "save", "skip"];

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

    return { ok: true };
  });
}
