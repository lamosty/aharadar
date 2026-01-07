import type { FastifyInstance } from "fastify";
import { type ViewingProfile, PROFILE_DECAY_HOURS, type Topic } from "@aharadar/db";
import { getDb, getSingletonContext } from "../lib/db.js";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_REGEX.test(value);
}

/** Convert Topic to API response format */
function formatTopic(topic: Topic) {
  return {
    id: topic.id,
    userId: topic.userId,
    name: topic.name,
    description: topic.description,
    viewingProfile: topic.viewingProfile,
    decayHours: topic.decayHours,
    lastCheckedAt: topic.lastCheckedAt?.toISOString() ?? null,
    createdAt: topic.createdAt.toISOString(),
  };
}

interface UpdateViewingProfileBody {
  viewingProfile?: ViewingProfile;
  decayHours?: number;
}

export async function topicsRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /topics - List all topics for current user
  fastify.get("/topics", async (_request, reply) => {
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
    const rows = await db.topics.listByUser(ctx.userId);

    // Convert rows to Topic objects for formatting
    const topics = rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      name: row.name,
      description: row.description,
      viewingProfile: row.viewing_profile,
      decayHours: row.decay_hours,
      lastCheckedAt: row.last_checked_at ? new Date(row.last_checked_at) : null,
      createdAt: new Date(row.created_at),
    }));

    return {
      ok: true,
      topics: topics.map(formatTopic),
      profileOptions: [
        {
          value: "power",
          label: "Power User",
          description: "For checking multiple times per day",
          decayHours: PROFILE_DECAY_HOURS.power,
        },
        {
          value: "daily",
          label: "Daily",
          description: "For checking once per day",
          decayHours: PROFILE_DECAY_HOURS.daily,
        },
        {
          value: "weekly",
          label: "Weekly",
          description: "For weekly catch-up sessions",
          decayHours: PROFILE_DECAY_HOURS.weekly,
        },
        {
          value: "research",
          label: "Research",
          description: "For monthly deep dives",
          decayHours: PROFILE_DECAY_HOURS.research,
        },
        {
          value: "custom",
          label: "Custom",
          description: "Set your own decay rate",
          decayHours: null,
        },
      ],
    };
  });

  // GET /topics/:id - Get a specific topic
  fastify.get<{ Params: { id: string } }>("/topics/:id", async (request, reply) => {
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
          message: "id must be a valid UUID",
        },
      });
    }

    const db = getDb();
    const row = await db.topics.getById(id);

    if (!row) {
      return reply.code(404).send({
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: `Topic not found: ${id}`,
        },
      });
    }

    // Verify ownership
    if (row.user_id !== ctx.userId) {
      return reply.code(403).send({
        ok: false,
        error: {
          code: "FORBIDDEN",
          message: "Topic does not belong to current user",
        },
      });
    }

    const topic: Topic = {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      description: row.description,
      viewingProfile: row.viewing_profile,
      decayHours: row.decay_hours,
      lastCheckedAt: row.last_checked_at ? new Date(row.last_checked_at) : null,
      createdAt: new Date(row.created_at),
    };

    return {
      ok: true,
      topic: formatTopic(topic),
      profileOptions: [
        {
          value: "power",
          label: "Power User",
          description: "For checking multiple times per day",
          decayHours: PROFILE_DECAY_HOURS.power,
        },
        {
          value: "daily",
          label: "Daily",
          description: "For checking once per day",
          decayHours: PROFILE_DECAY_HOURS.daily,
        },
        {
          value: "weekly",
          label: "Weekly",
          description: "For weekly catch-up sessions",
          decayHours: PROFILE_DECAY_HOURS.weekly,
        },
        {
          value: "research",
          label: "Research",
          description: "For monthly deep dives",
          decayHours: PROFILE_DECAY_HOURS.research,
        },
        {
          value: "custom",
          label: "Custom",
          description: "Set your own decay rate",
          decayHours: null,
        },
      ],
    };
  });

  // PATCH /topics/:id/viewing-profile - Update topic viewing profile
  fastify.patch<{ Params: { id: string }; Body: UpdateViewingProfileBody }>(
    "/topics/:id/viewing-profile",
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

      const { id } = request.params;

      if (!isValidUuid(id)) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: "INVALID_PARAM",
            message: "id must be a valid UUID",
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

      const { viewingProfile, decayHours } = body as Record<string, unknown>;

      // Validate viewingProfile if provided
      if (viewingProfile !== undefined) {
        const validProfiles: ViewingProfile[] = ["power", "daily", "weekly", "research", "custom"];
        if (!validProfiles.includes(viewingProfile as ViewingProfile)) {
          return reply.code(400).send({
            ok: false,
            error: {
              code: "INVALID_PARAM",
              message: `Invalid viewingProfile: must be one of ${validProfiles.join(", ")}`,
            },
          });
        }
      }

      // Validate decayHours if provided
      if (decayHours !== undefined) {
        if (typeof decayHours !== "number" || decayHours < 1 || decayHours > 720) {
          return reply.code(400).send({
            ok: false,
            error: {
              code: "INVALID_PARAM",
              message: "Invalid decayHours: must be a number between 1 and 720",
            },
          });
        }
      }

      // Verify topic exists and belongs to user
      const db = getDb();
      const existing = await db.topics.getById(id);

      if (!existing) {
        return reply.code(404).send({
          ok: false,
          error: {
            code: "NOT_FOUND",
            message: `Topic not found: ${id}`,
          },
        });
      }

      if (existing.user_id !== ctx.userId) {
        return reply.code(403).send({
          ok: false,
          error: {
            code: "FORBIDDEN",
            message: "Topic does not belong to current user",
          },
        });
      }

      // Apply updates
      const updated = await db.topics.updateViewingProfile(id, {
        viewingProfile: viewingProfile as ViewingProfile | undefined,
        decayHours: decayHours as number | undefined,
      });

      return {
        ok: true,
        topic: formatTopic(updated),
      };
    }
  );

  // POST /topics/:id/mark-checked - Mark topic as "caught up"
  fastify.post<{ Params: { id: string } }>("/topics/:id/mark-checked", async (request, reply) => {
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
          message: "id must be a valid UUID",
        },
      });
    }

    // Verify topic exists and belongs to user
    const db = getDb();
    const existing = await db.topics.getById(id);

    if (!existing) {
      return reply.code(404).send({
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: `Topic not found: ${id}`,
        },
      });
    }

    if (existing.user_id !== ctx.userId) {
      return reply.code(403).send({
        ok: false,
        error: {
          code: "FORBIDDEN",
          message: "Topic does not belong to current user",
        },
      });
    }

    const updated = await db.topics.touchLastChecked(id);

    return {
      ok: true,
      topic: formatTopic(updated),
      message: "Topic marked as caught up",
    };
  });
}
