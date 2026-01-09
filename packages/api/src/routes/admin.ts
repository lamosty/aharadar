import type { LlmProvider, LlmSettingsUpdate, SourceRow } from "@aharadar/db";
import { computeCreditsStatus } from "@aharadar/pipeline";
import { type ProviderOverride, RUN_WINDOW_JOB_NAME } from "@aharadar/queues";
import { loadRuntimeEnv, type OpsLinks } from "@aharadar/shared";
import type { FastifyInstance } from "fastify";
import { getUserId } from "../auth/session.js";
import { getDb, getSingletonContext } from "../lib/db.js";
import { getPipelineQueue } from "../lib/queue.js";

// catch_up mode removed per task-121/122; modes are now only low/normal/high
type RunMode = "low" | "normal" | "high";
const VALID_MODES: RunMode[] = ["low", "normal", "high"];

function isValidIsoDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const d = new Date(value);
  return !Number.isNaN(d.getTime());
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
    topicId: row.topic_id,
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
  topicId?: string;
  providerOverride?: ProviderOverride;
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
  topicId?: string;
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

    const { type, name, config, isEnabled, topicId } = body as Record<string, unknown>;

    // Validate topicId if provided
    if (topicId !== undefined && !isValidUuid(topicId)) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "INVALID_PARAM",
          message: "topicId must be a valid UUID",
        },
      });
    }

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
    if (
      config !== undefined &&
      (typeof config !== "object" || config === null || Array.isArray(config))
    ) {
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

    // Resolve target topic: use provided topicId or fall back to context default
    const targetTopicId = typeof topicId === "string" ? topicId : ctx.topicId;

    // Verify topic belongs to user if custom topicId provided
    const db = getDb();
    if (topicId !== undefined) {
      const topic = await db.topics.getById(targetTopicId);
      if (!topic || topic.user_id !== ctx.userId) {
        return reply.code(403).send({
          ok: false,
          error: {
            code: "FORBIDDEN",
            message: "Topic does not belong to current user",
          },
        });
      }
    }

    const result = await db.sources.create({
      userId: ctx.userId,
      topicId: targetTopicId,
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

    const { windowStart, windowEnd, mode, topicId, providerOverride } = body as Record<
      string,
      unknown
    >;

    // Validate topicId if provided
    if (topicId !== undefined && !isValidUuid(topicId)) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "INVALID_PARAM",
          message: "topicId must be a valid UUID",
        },
      });
    }

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

    // Validate providerOverride if provided
    const validProviders = ["openai", "anthropic", "claude-subscription"] as const;
    let resolvedProviderOverride: ProviderOverride | undefined;
    if (providerOverride !== undefined) {
      if (typeof providerOverride !== "object" || providerOverride === null) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: "INVALID_PARAM",
            message: "providerOverride must be an object",
          },
        });
      }
      const { provider: overrideProvider, model: overrideModel } = providerOverride as Record<
        string,
        unknown
      >;
      if (
        overrideProvider !== undefined &&
        !validProviders.includes(overrideProvider as (typeof validProviders)[number])
      ) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: "INVALID_PARAM",
            message: `providerOverride.provider must be one of: ${validProviders.join(", ")}`,
          },
        });
      }
      if (overrideModel !== undefined && typeof overrideModel !== "string") {
        return reply.code(400).send({
          ok: false,
          error: {
            code: "INVALID_PARAM",
            message: "providerOverride.model must be a string",
          },
        });
      }
      resolvedProviderOverride = {
        provider: overrideProvider as ProviderOverride["provider"],
        model: overrideModel as string | undefined,
      };
    }

    // Resolve target topic: use provided topicId or fall back to context default
    const targetTopicId = typeof topicId === "string" ? topicId : ctx.topicId;

    // Verify topic belongs to user if custom topicId provided
    const db = getDb();
    if (topicId !== undefined) {
      const topic = await db.topics.getById(targetTopicId);
      if (!topic || topic.user_id !== ctx.userId) {
        return reply.code(403).send({
          ok: false,
          error: {
            code: "FORBIDDEN",
            message: "Topic does not belong to current user",
          },
        });
      }
    }

    const queue = getPipelineQueue();

    // Deterministic job ID including mode to avoid collision with scheduled runs
    // BullMQ doesn't allow colons in job IDs, so replace them with underscores
    const sanitizedStart = windowStart.replace(/:/g, "_");
    const sanitizedEnd = windowEnd.replace(/:/g, "_");
    const jobId = `${RUN_WINDOW_JOB_NAME}_${ctx.userId}_${targetTopicId}_${sanitizedStart}_${sanitizedEnd}_${resolvedMode}`;

    await queue.add(
      RUN_WINDOW_JOB_NAME,
      {
        userId: ctx.userId,
        topicId: targetTopicId,
        windowStart,
        windowEnd,
        mode: resolvedMode,
        providerOverride: resolvedProviderOverride,
      },
      {
        jobId,
        removeOnComplete: 100,
        removeOnFail: 50,
      },
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

  // GET /admin/sources - List all sources for user (across all topics)
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
    // List ALL sources for user (not filtered by topic) so UI can show topic assignments
    const rows = await db.sources.listByUser(ctx.userId);

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

    const { name, isEnabled, configPatch, topicId } = body as Record<string, unknown>;

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

    // Verify ownership (source belongs to current user)
    if (existing.user_id !== ctx.userId) {
      return reply.code(403).send({
        ok: false,
        error: {
          code: "FORBIDDEN",
          message: "Source does not belong to current user",
        },
      });
    }

    // Validate topicId if provided (for moving source to different topic)
    if (topicId !== undefined) {
      if (!isValidUuid(topicId)) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: "INVALID_PARAM",
            message: "topicId must be a valid UUID",
          },
        });
      }

      // Verify target topic belongs to user
      const targetTopic = await db.topics.getById(topicId as string);
      if (!targetTopic || targetTopic.user_id !== ctx.userId) {
        return reply.code(403).send({
          ok: false,
          error: {
            code: "FORBIDDEN",
            message: "Target topic does not belong to current user",
          },
        });
      }
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

    // Apply topic update (move source to different topic)
    if (typeof topicId === "string") {
      await db.sources.updateTopic({ sourceId: id, topicId });
    }

    if (configPatch !== undefined && typeof configPatch === "object" && configPatch !== null) {
      const patch = configPatch as Record<string, unknown>;

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

    // Verify ownership (source belongs to current user)
    if (existing.user_id !== ctx.userId) {
      return reply.code(403).send({
        ok: false,
        error: {
          code: "FORBIDDEN",
          message: "Source does not belong to current user",
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

  // GET /admin/llm-settings - Get current LLM configuration
  fastify.get("/admin/llm-settings", async (_request, reply) => {
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
    const settings = await db.llmSettings.get();

    return {
      ok: true,
      settings: {
        provider: settings.provider,
        anthropicModel: settings.anthropic_model,
        openaiModel: settings.openai_model,
        claudeSubscriptionEnabled: settings.claude_subscription_enabled,
        claudeTriageThinking: settings.claude_triage_thinking,
        claudeCallsPerHour: settings.claude_calls_per_hour,
        updatedAt: settings.updated_at,
      },
    };
  });

  // GET /admin/users - List all users (admin only)
  fastify.get("/admin/users", async (request, reply) => {
    const db = getDb();

    // Get current user and verify admin role
    try {
      const userId = getUserId(request);
      const user = await db.users.getById(userId);
      if (!user || user.role !== "admin") {
        return reply.code(403).send({
          ok: false,
          error: {
            code: "FORBIDDEN",
            message: "Admin access required",
          },
        });
      }
    } catch {
      return reply.code(401).send({
        ok: false,
        error: {
          code: "NOT_AUTHENTICATED",
          message: "Authentication required",
        },
      });
    }

    const users = await db.users.listAll();

    return {
      ok: true,
      users: users.map((u) => ({
        id: u.id,
        email: u.email,
        role: u.role,
        createdAt: u.created_at,
      })),
    };
  });

  // PATCH /admin/llm-settings - Update LLM configuration
  fastify.patch("/admin/llm-settings", async (request, reply) => {
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

    const {
      provider,
      anthropicModel,
      openaiModel,
      claudeSubscriptionEnabled,
      claudeTriageThinking,
      claudeCallsPerHour,
    } = body as Record<string, unknown>;

    // Validate provider if provided
    const validProviders: LlmProvider[] = ["openai", "anthropic", "claude-subscription"];
    if (provider !== undefined && !validProviders.includes(provider as LlmProvider)) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "INVALID_PARAM",
          message: `provider must be one of: ${validProviders.join(", ")}`,
        },
      });
    }

    // Validate model strings
    if (anthropicModel !== undefined && typeof anthropicModel !== "string") {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "INVALID_PARAM",
          message: "anthropicModel must be a string",
        },
      });
    }

    if (openaiModel !== undefined && typeof openaiModel !== "string") {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "INVALID_PARAM",
          message: "openaiModel must be a string",
        },
      });
    }

    // Validate boolean fields
    if (claudeSubscriptionEnabled !== undefined && typeof claudeSubscriptionEnabled !== "boolean") {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "INVALID_PARAM",
          message: "claudeSubscriptionEnabled must be a boolean",
        },
      });
    }

    if (claudeTriageThinking !== undefined && typeof claudeTriageThinking !== "boolean") {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "INVALID_PARAM",
          message: "claudeTriageThinking must be a boolean",
        },
      });
    }

    // Validate numeric field
    if (claudeCallsPerHour !== undefined) {
      if (
        typeof claudeCallsPerHour !== "number" ||
        !Number.isInteger(claudeCallsPerHour) ||
        claudeCallsPerHour < 1
      ) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: "INVALID_PARAM",
            message: "claudeCallsPerHour must be a positive integer",
          },
        });
      }
    }

    // Build update params
    const updateParams: LlmSettingsUpdate = {};
    if (provider !== undefined) updateParams.provider = provider as LlmProvider;
    if (anthropicModel !== undefined) updateParams.anthropic_model = anthropicModel as string;
    if (openaiModel !== undefined) updateParams.openai_model = openaiModel as string;
    if (claudeSubscriptionEnabled !== undefined)
      updateParams.claude_subscription_enabled = claudeSubscriptionEnabled as boolean;
    if (claudeTriageThinking !== undefined)
      updateParams.claude_triage_thinking = claudeTriageThinking as boolean;
    if (claudeCallsPerHour !== undefined)
      updateParams.claude_calls_per_hour = claudeCallsPerHour as number;

    const db = getDb();
    const settings = await db.llmSettings.update(updateParams);

    return {
      ok: true,
      settings: {
        provider: settings.provider,
        anthropicModel: settings.anthropic_model,
        openaiModel: settings.openai_model,
        claudeSubscriptionEnabled: settings.claude_subscription_enabled,
        claudeTriageThinking: settings.claude_triage_thinking,
        claudeCallsPerHour: settings.claude_calls_per_hour,
        updatedAt: settings.updated_at,
      },
    };
  });

  // GET /admin/queue-status - Get status of pipeline jobs in queue
  fastify.get("/admin/queue-status", async (_request, reply) => {
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

    const queue = getPipelineQueue();

    // Get active and waiting jobs
    const [activeJobs, waitingJobs] = await Promise.all([
      queue.getJobs(["active"]),
      queue.getJobs(["waiting", "delayed"]),
    ]);

    // Format job info
    const formatJob = (job: Awaited<ReturnType<typeof queue.getJobs>>[number]) => ({
      id: job.id,
      name: job.name,
      data: {
        topicId: job.data.topicId,
        windowStart: job.data.windowStart,
        windowEnd: job.data.windowEnd,
        mode: job.data.mode,
      },
      progress: job.progress,
      attemptsMade: job.attemptsMade,
      timestamp: job.timestamp,
      processedOn: job.processedOn,
    });

    return {
      ok: true,
      queue: {
        active: activeJobs.map(formatJob),
        waiting: waitingJobs.map(formatJob),
        counts: {
          active: activeJobs.length,
          waiting: waitingJobs.length,
        },
      },
    };
  });

  // GET /admin/ops-status - Get worker health, queue counts, and ops links
  fastify.get("/admin/ops-status", async (request, reply) => {
    const db = getDb();

    // Verify admin role
    try {
      const userId = getUserId(request);
      const user = await db.users.getById(userId);
      if (!user || user.role !== "admin") {
        return reply.code(403).send({
          ok: false,
          error: {
            code: "FORBIDDEN",
            message: "Admin access required",
          },
        });
      }
    } catch {
      return reply.code(401).send({
        ok: false,
        error: {
          code: "NOT_AUTHENTICATED",
          message: "Authentication required",
        },
      });
    }

    const env = loadRuntimeEnv();

    // Probe worker health with short timeout (1s)
    let workerHealth: { ok: boolean; startedAt?: string; lastSchedulerTickAt?: string | null } = {
      ok: false,
    };
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1000);
      const response = await fetch(env.workerHealthUrl, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (response.ok) {
        const data = (await response.json()) as {
          ok: boolean;
          startedAt: string;
          lastSchedulerTickAt: string | null;
        };
        workerHealth = {
          ok: data.ok,
          startedAt: data.startedAt,
          lastSchedulerTickAt: data.lastSchedulerTickAt,
        };
      }
    } catch {
      // Worker unreachable or timed out
      workerHealth = { ok: false };
    }

    // Get queue counts from BullMQ
    const queue = getPipelineQueue();
    const counts = await queue.getJobCounts("waiting", "active");

    // Build ops links (only include if configured)
    const links: OpsLinks = {};
    if (env.opsLinks.grafana) links.grafana = env.opsLinks.grafana;
    if (env.opsLinks.prometheus) links.prometheus = env.opsLinks.prometheus;
    if (env.opsLinks.queue) links.queue = env.opsLinks.queue;
    if (env.opsLinks.logs) links.logs = env.opsLinks.logs;

    return {
      ok: true,
      worker: workerHealth,
      queue: {
        active: counts.active,
        waiting: counts.waiting,
      },
      links,
    };
  });
}
