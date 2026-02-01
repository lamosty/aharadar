import type { DigestMode, Topic } from "@aharadar/db";
import { validateAiGuidance, validatePersonalizationTuning } from "@aharadar/shared";
import type { FastifyInstance } from "fastify";
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
    // Digest schedule fields
    digestScheduleEnabled: topic.digestScheduleEnabled,
    digestIntervalMinutes: topic.digestIntervalMinutes,
    digestMode: topic.digestMode,
    digestDepth: topic.digestDepth,
    digestCursorEnd: topic.digestCursorEnd?.toISOString() ?? null,
    // Custom settings
    customSettings: topic.customSettings,
  };
}

interface CreateTopicBody {
  name: string;
  description?: string;
}

interface UpdateTopicBody {
  name?: string;
  description?: string | null;
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
      // Digest schedule fields
      digestScheduleEnabled: row.digest_schedule_enabled,
      digestIntervalMinutes: row.digest_interval_minutes,
      digestMode: row.digest_mode,
      digestDepth: row.digest_depth,
      digestCursorEnd: row.digest_cursor_end ? new Date(row.digest_cursor_end) : null,
      customSettings: row.custom_settings,
    }));

    return {
      ok: true,
      topics: topics.map(formatTopic),
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
      // Digest schedule fields
      digestScheduleEnabled: row.digest_schedule_enabled,
      digestIntervalMinutes: row.digest_interval_minutes,
      digestMode: row.digest_mode,
      digestDepth: row.digest_depth,
      digestCursorEnd: row.digest_cursor_end ? new Date(row.digest_cursor_end) : null,
      customSettings: row.custom_settings,
    };

    return {
      ok: true,
      topic: formatTopic(topic),
    };
  });

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

  // PATCH /topics/:id/digest-settings - Update topic digest schedule settings
  fastify.patch<{ Params: { id: string } }>(
    "/topics/:id/digest-settings",
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

      const { digestScheduleEnabled, digestIntervalMinutes, digestMode, digestDepth } =
        body as Record<string, unknown>;

      // Validate digestScheduleEnabled if provided
      if (digestScheduleEnabled !== undefined && typeof digestScheduleEnabled !== "boolean") {
        return reply.code(400).send({
          ok: false,
          error: {
            code: "INVALID_PARAM",
            message: "digestScheduleEnabled must be a boolean",
          },
        });
      }

      // Validate digestIntervalMinutes if provided
      if (digestIntervalMinutes !== undefined) {
        if (
          typeof digestIntervalMinutes !== "number" ||
          !Number.isInteger(digestIntervalMinutes) ||
          digestIntervalMinutes < 15 ||
          digestIntervalMinutes > 43200
        ) {
          return reply.code(400).send({
            ok: false,
            error: {
              code: "INVALID_PARAM",
              message: "digestIntervalMinutes must be an integer between 15 and 43200",
            },
          });
        }
      }

      // Validate digestMode if provided
      if (digestMode !== undefined) {
        const validModes: DigestMode[] = ["low", "normal", "high"];
        if (!validModes.includes(digestMode as DigestMode)) {
          return reply.code(400).send({
            ok: false,
            error: {
              code: "INVALID_PARAM",
              message: `digestMode must be one of: ${validModes.join(", ")}`,
            },
          });
        }
      }

      // Validate digestDepth if provided
      if (digestDepth !== undefined) {
        if (
          typeof digestDepth !== "number" ||
          !Number.isInteger(digestDepth) ||
          digestDepth < 0 ||
          digestDepth > 100
        ) {
          return reply.code(400).send({
            ok: false,
            error: {
              code: "INVALID_PARAM",
              message: "digestDepth must be an integer between 0 and 100",
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
      const updated = await db.topics.updateDigestSettings(id, {
        digestScheduleEnabled: digestScheduleEnabled as boolean | undefined,
        digestIntervalMinutes: digestIntervalMinutes as number | undefined,
        digestMode: digestMode as DigestMode | undefined,
        digestDepth: digestDepth as number | undefined,
      });

      return {
        ok: true,
        topic: formatTopic(updated),
      };
    },
  );

  // PATCH /topics/:id/custom-settings - Update topic custom settings
  fastify.patch<{ Params: { id: string } }>(
    "/topics/:id/custom-settings",
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
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: "INVALID_BODY",
            message: "Request body must be a JSON object",
          },
        });
      }

      const bodyObj = body as Record<string, unknown>;

      // Validate personalization_tuning_v1 if present
      if (bodyObj.personalization_tuning_v1 !== undefined) {
        const tuningInput = bodyObj.personalization_tuning_v1;
        if (
          tuningInput !== null &&
          typeof tuningInput === "object" &&
          !Array.isArray(tuningInput)
        ) {
          const errors = validatePersonalizationTuning(tuningInput as Record<string, unknown>);
          if (errors.length > 0) {
            return reply.code(400).send({
              ok: false,
              error: {
                code: "INVALID_TUNING",
                message: `Invalid personalization tuning: ${errors.join("; ")}`,
              },
            });
          }
        }
      }

      // Validate ai_guidance_v1 if present
      if (bodyObj.ai_guidance_v1 !== undefined) {
        const guidanceInput = bodyObj.ai_guidance_v1;
        if (
          guidanceInput !== null &&
          typeof guidanceInput === "object" &&
          !Array.isArray(guidanceInput)
        ) {
          const errors = validateAiGuidance(guidanceInput as Record<string, unknown>);
          if (errors.length > 0) {
            return reply.code(400).send({
              ok: false,
              error: {
                code: "INVALID_AI_GUIDANCE",
                message: `Invalid AI guidance: ${errors.join("; ")}`,
              },
            });
          }
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

      // Merge with existing custom_settings (preserve unknown keys)
      const existingSettings = existing.custom_settings ?? {};
      const nextSettings = {
        ...existingSettings,
        ...bodyObj,
      };

      // Apply updates
      const updated = await db.topics.updateCustomSettings(id, nextSettings);

      return {
        ok: true,
        topic: formatTopic(updated),
      };
    },
  );

  // POST /topics - Create a new topic
  fastify.post<{ Body: CreateTopicBody }>("/topics", async (request, reply) => {
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

    const { name, description } = body as Record<string, unknown>;

    // Validate name
    if (typeof name !== "string" || name.trim().length === 0) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "INVALID_PARAM",
          message: "name is required and must be a non-empty string",
        },
      });
    }

    const trimmedName = name.trim();
    if (trimmedName.length > 100) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "INVALID_PARAM",
          message: "name must be 100 characters or less",
        },
      });
    }

    // Check if topic with this name already exists
    const db = getDb();
    const existing = await db.topics.getByName({ userId: ctx.userId, name: trimmedName });
    if (existing) {
      return reply.code(409).send({
        ok: false,
        error: {
          code: "DUPLICATE",
          message: `A topic named "${trimmedName}" already exists`,
        },
      });
    }

    // Create the topic
    const topic = await db.topics.create({
      userId: ctx.userId,
      name: trimmedName,
      description: typeof description === "string" ? description.trim() : null,
    });

    return reply.code(201).send({
      ok: true,
      topic: formatTopic(topic),
    });
  });

  // PATCH /topics/:id - Update topic name/description
  fastify.patch<{ Params: { id: string }; Body: UpdateTopicBody }>(
    "/topics/:id",
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

      const { name, description } = body as Record<string, unknown>;

      // Validate name if provided
      if (name !== undefined) {
        if (typeof name !== "string" || name.trim().length === 0) {
          return reply.code(400).send({
            ok: false,
            error: {
              code: "INVALID_PARAM",
              message: "name must be a non-empty string",
            },
          });
        }
        if (name.trim().length > 100) {
          return reply.code(400).send({
            ok: false,
            error: {
              code: "INVALID_PARAM",
              message: "name must be 100 characters or less",
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

      // Check for duplicate name if renaming
      if (name !== undefined && name.trim() !== existing.name) {
        const duplicate = await db.topics.getByName({ userId: ctx.userId, name: name.trim() });
        if (duplicate) {
          return reply.code(409).send({
            ok: false,
            error: {
              code: "DUPLICATE",
              message: `A topic named "${name.trim()}" already exists`,
            },
          });
        }
      }

      const updated = await db.topics.update(id, {
        name: typeof name === "string" ? name.trim() : undefined,
        description:
          description === null
            ? null
            : typeof description === "string"
              ? description.trim()
              : undefined,
      });

      return {
        ok: true,
        topic: formatTopic(updated),
      };
    },
  );

  // DELETE /topics/:id - Delete a topic
  fastify.delete<{ Params: { id: string } }>("/topics/:id", async (request, reply) => {
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

    // Get all topics to check if this is the last one
    const allTopics = await db.topics.listByUser(ctx.userId);

    // Don't allow deleting the last topic
    if (allTopics.length <= 1) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "INVALID_OPERATION",
          message: "Cannot delete your only topic",
        },
      });
    }

    // Move sources to the first topic (by creation date) before deleting
    const firstTopic = allTopics.find((t) => t.id !== id);
    if (firstTopic) {
      await db.query("UPDATE sources SET topic_id = $1 WHERE topic_id = $2", [firstTopic.id, id]);
    }

    await db.topics.delete(id);

    return {
      ok: true,
      message: `Topic deleted. Sources have been moved to "${firstTopic?.name ?? "another topic"}".`,
    };
  });

  // GET /topics/:id/last-digest-end - Get the window_end of the most recent completed digest
  // Used by admin run page to continue from last run
  fastify.get<{ Params: { id: string } }>("/topics/:id/last-digest-end", async (request, reply) => {
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

    // Get the most recent completed digest for this topic
    const result = await db.query<{ window_end: string }>(
      `SELECT window_end::text
         FROM digests
         WHERE topic_id = $1 AND user_id = $2 AND status = 'complete'
         ORDER BY created_at DESC
         LIMIT 1`,
      [id, ctx.userId],
    );

    if (result.rows.length === 0) {
      return {
        ok: true,
        windowEnd: null,
      };
    }

    return {
      ok: true,
      windowEnd: result.rows[0].window_end,
    };
  });
}
