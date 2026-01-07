import type { FastifyInstance } from "fastify";
import { RUN_WINDOW_JOB_NAME } from "@aharadar/queues";
import { computeCreditsStatus } from "@aharadar/pipeline";
import type { SourceRow } from "@aharadar/db";
import { getDb, getSingletonContext } from "../lib/db.js";
import { getPipelineQueue } from "../lib/queue.js";

type RunMode = "low" | "normal" | "high" | "catch_up";
const VALID_MODES: RunMode[] = ["low", "normal", "high", "catch_up"];

function isValidIsoDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const d = new Date(value);
  return !isNaN(d.getTime());
}

function isValidMode(value: unknown): value is RunMode {
  return typeof value === "string" && VALID_MODES.includes(value as RunMode);
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_REGEX.test(value);
}

/** Convert DB source row to API response format */
function formatSource(row: SourceRow) {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    isEnabled: row.is_enabled,
    config: row.config_json,
    createdAt: row.created_at,
  };
}

interface AdminRunRequestBody {
  windowStart: string;
  windowEnd: string;
  mode?: RunMode;
}

/** Supported source types */
const SUPPORTED_SOURCE_TYPES = ["reddit", "hn", "rss", "signal", "x_posts", "youtube"] as const;
type SupportedSourceType = (typeof SUPPORTED_SOURCE_TYPES)[number];

function isSupportedSourceType(value: unknown): value is SupportedSourceType {
  return typeof value === "string" && SUPPORTED_SOURCE_TYPES.includes(value as SupportedSourceType);
}

interface AdminSourcesCreateBody {
  type: string;
  name: string;
  config?: Record<string, unknown>;
  isEnabled?: boolean;
}

export async function adminRoutes(fastify: FastifyInstance): Promise<void> {
  // POST /admin/sources - Create a new source
  fastify.post<{ Body: AdminSourcesCreateBody }>("/admin/sources", async (request, reply) => {
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

    const { type, name, config, isEnabled } = body as Record<string, unknown>;

    // Validate type (required)
    if (typeof type !== "string" || type.trim().length === 0) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "INVALID_PARAM",
          message: "type is required and must be a non-empty string",
        },
      });
    }

    if (!isSupportedSourceType(type)) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "INVALID_PARAM",
          message: `type must be one of: ${SUPPORTED_SOURCE_TYPES.join(", ")}`,
        },
      });
    }

    // Validate name (required)
    if (typeof name !== "string" || name.trim().length === 0) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "INVALID_PARAM",
          message: "name is required and must be a non-empty string",
        },
      });
    }

    // Validate config (optional, must be object if provided)
    if (config !== undefined && (typeof config !== "object" || config === null || Array.isArray(config))) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "INVALID_PARAM",
          message: "config must be an object if provided",
        },
      });
    }

    // Validate isEnabled (optional, must be boolean if provided)
    if (isEnabled !== undefined && typeof isEnabled !== "boolean") {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "INVALID_PARAM",
          message: "isEnabled must be a boolean if provided",
        },
      });
    }

    const db = getDb();
    const result = await db.sources.create({
      userId: ctx.userId,
      topicId: ctx.topicId,
      type: type.trim(),
      name: name.trim(),
      config: (config as Record<string, unknown>) ?? {},
      isEnabled: isEnabled ?? true,
    });

    // Fetch the created source to return full details
    const created = await db.sources.getById(result.id);
    if (!created) {
      return reply.code(500).send({
        ok: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to fetch created source",
        },
      });
    }

    return reply.code(201).send({
      ok: true,
      source: formatSource(created),
    });
  });

  fastify.post<{ Body: AdminRunRequestBody }>("/admin/run", async (request, reply) => {
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

    const { windowStart, windowEnd, mode } = body as Record<string, unknown>;

    if (!isValidIsoDate(windowStart)) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "INVALID_PARAM",
          message: "windowStart must be a valid ISO date string",
        },
      });
    }

    if (!isValidIsoDate(windowEnd)) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "INVALID_PARAM",
          message: "windowEnd must be a valid ISO date string",
        },
      });
    }

    if (new Date(windowStart) >= new Date(windowEnd)) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "INVALID_PARAM",
          message: "windowStart must be before windowEnd",
        },
      });
    }

    const resolvedMode: RunMode = mode !== undefined && isValidMode(mode) ? mode : "normal";

    if (mode !== undefined && !isValidMode(mode)) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "INVALID_PARAM",
          message: `mode must be one of: ${VALID_MODES.join(", ")}`,
        },
      });
    }

    const queue = getPipelineQueue();

    // Deterministic job ID including mode to avoid collision with scheduled runs
    const jobId = `${RUN_WINDOW_JOB_NAME}:${ctx.userId}:${ctx.topicId}:${windowStart}:${windowEnd}:${resolvedMode}`;

    await queue.add(
      RUN_WINDOW_JOB_NAME,
      {
        userId: ctx.userId,
        topicId: ctx.topicId,
        windowStart,
        windowEnd,
        mode: resolvedMode,
      },
      {
        jobId,
        removeOnComplete: 100,
        removeOnFail: 50,
      }
    );

    return { ok: true, jobId };
  });

  fastify.get("/admin/budgets", async (_request, reply) => {
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

    const monthlyCredits = Number.parseInt(process.env.MONTHLY_CREDITS ?? "10000", 10);
    const dailyThrottleCreditsStr = process.env.DAILY_THROTTLE_CREDITS;
    const dailyThrottleCredits = dailyThrottleCreditsStr
      ? Number.parseInt(dailyThrottleCreditsStr, 10)
      : undefined;

    const windowEnd = new Date().toISOString();

    const status = await computeCreditsStatus({
      db: getDb(),
      userId: ctx.userId,
      monthlyCredits,
      dailyThrottleCredits,
      windowEnd,
    });

    return {
      ok: true,
      budgets: status,
    };
  });

  // GET /admin/sources - List all sources for singleton user/topic
  fastify.get("/admin/sources", async (_request, reply) => {
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
    const rows = await db.sources.listByUserAndTopic({
      userId: ctx.userId,
      topicId: ctx.topicId,
    });

    return {
      ok: true,
      sources: rows.map(formatSource),
    };
  });

  // PATCH /admin/sources/:id - Update source fields
  fastify.patch<{ Params: { id: string } }>("/admin/sources/:id", async (request, reply) => {
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

    // Validate UUID format
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

    const { name, isEnabled, configPatch } = body as Record<string, unknown>;

    // Get current source and verify ownership
    const db = getDb();
    const existing = await db.sources.getById(id);

    if (!existing) {
      return reply.code(404).send({
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: `Source not found: ${id}`,
        },
      });
    }

    // Verify ownership (source belongs to current user/topic)
    if (existing.user_id !== ctx.userId || existing.topic_id !== ctx.topicId) {
      return reply.code(403).send({
        ok: false,
        error: {
          code: "FORBIDDEN",
          message: "Source does not belong to current user/topic",
        },
      });
    }

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
    }

    // Validate isEnabled if provided
    if (isEnabled !== undefined && typeof isEnabled !== "boolean") {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "INVALID_PARAM",
          message: "isEnabled must be a boolean",
        },
      });
    }

    // Validate configPatch if provided
    if (configPatch !== undefined) {
      if (typeof configPatch !== "object" || configPatch === null) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: "INVALID_PARAM",
            message: "configPatch must be an object",
          },
        });
      }

      const patch = configPatch as Record<string, unknown>;

      // Validate cadence if provided
      if ("cadence" in patch && patch.cadence !== null) {
        const cadence = patch.cadence as Record<string, unknown>;
        if (
          typeof cadence !== "object" ||
          cadence.mode !== "interval" ||
          typeof cadence.every_minutes !== "number" ||
          !Number.isFinite(cadence.every_minutes) ||
          cadence.every_minutes <= 0
        ) {
          return reply.code(400).send({
            ok: false,
            error: {
              code: "INVALID_PARAM",
              message:
                "configPatch.cadence must be { mode: 'interval', every_minutes: <positive number> } or null",
            },
          });
        }
      }

      // Validate weight if provided
      if ("weight" in patch && patch.weight !== null) {
        if (typeof patch.weight !== "number" || !Number.isFinite(patch.weight)) {
          return reply.code(400).send({
            ok: false,
            error: {
              code: "INVALID_PARAM",
              message: "configPatch.weight must be a number or null",
            },
          });
        }
      }
    }

    // Apply updates
    if (typeof name === "string") {
      await db.sources.updateName({ sourceId: id, name: name.trim() });
    }

    if (typeof isEnabled === "boolean") {
      await db.sources.updateEnabled({ sourceId: id, isEnabled });
    }

    if (configPatch !== undefined && typeof configPatch === "object" && configPatch !== null) {
      const patch = configPatch as Record<string, unknown>;

      // Apply cadence update
      if ("cadence" in patch) {
        if (patch.cadence === null) {
          await db.sources.updateConfigCadence({ sourceId: id, cadence: null });
        } else {
          const cadence = patch.cadence as { mode: "interval"; every_minutes: number };
          await db.sources.updateConfigCadence({
            sourceId: id,
            cadence: { mode: "interval", everyMinutes: cadence.every_minutes },
          });
        }
      }

      // Apply weight update
      if ("weight" in patch) {
        await db.sources.updateConfigWeight({
          sourceId: id,
          weight: patch.weight as number | null,
        });
      }
    }

    // Fetch updated source
    const updated = await db.sources.getById(id);
    if (!updated) {
      // This should not happen, but handle gracefully
      return reply.code(500).send({
        ok: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to fetch updated source",
        },
      });
    }

    return {
      ok: true,
      source: formatSource(updated),
    };
  });

  // DELETE /admin/sources/:id - Delete a source
  fastify.delete<{ Params: { id: string } }>("/admin/sources/:id", async (request, reply) => {
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

    // Validate UUID format
    if (!isValidUuid(id)) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "INVALID_PARAM",
          message: "id must be a valid UUID",
        },
      });
    }

    // Get current source and verify ownership before deleting
    const db = getDb();
    const existing = await db.sources.getById(id);

    if (!existing) {
      return reply.code(404).send({
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: `Source not found: ${id}`,
        },
      });
    }

    // Verify ownership (source belongs to current user/topic)
    if (existing.user_id !== ctx.userId || existing.topic_id !== ctx.topicId) {
      return reply.code(403).send({
        ok: false,
        error: {
          code: "FORBIDDEN",
          message: "Source does not belong to current user/topic",
        },
      });
    }

    // Delete the source (CASCADE will handle related records)
    const deleted = await db.sources.delete({ sourceId: id, userId: ctx.userId });

    if (!deleted) {
      return reply.code(500).send({
        ok: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to delete source",
        },
      });
    }

    return {
      ok: true,
      deleted: true,
    };
  });
}
