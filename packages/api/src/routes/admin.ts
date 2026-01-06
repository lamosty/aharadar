import type { FastifyInstance } from "fastify";
import { RUN_WINDOW_JOB_NAME } from "@aharadar/queues";
import { getSingletonContext } from "../lib/db.js";
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

interface AdminRunRequestBody {
  windowStart: string;
  windowEnd: string;
  mode?: RunMode;
}

export async function adminRoutes(fastify: FastifyInstance): Promise<void> {
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
}
