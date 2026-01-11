import type { LlmProvider, LlmSettingsUpdate, SourceRow } from "@aharadar/db";
import { checkQuotaForRun } from "@aharadar/llm";
import { compileDigestPlan, computeCreditsStatus } from "@aharadar/pipeline";
import {
  type AbtestVariantConfig,
  type ProviderOverride,
  RUN_ABTEST_JOB_NAME,
  RUN_WINDOW_JOB_NAME,
} from "@aharadar/queues";
import type { BudgetTier } from "@aharadar/shared";
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
const SUPPORTED_SOURCE_TYPES = ["reddit", "hn", "rss", "x_posts", "youtube"] as const;
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

    // Validate mode if explicitly provided (but we'll default to topic's mode later)
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

    // Load topic to verify ownership and get default mode
    const db = getDb();
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

    // Use provided mode or fall back to topic's configured digestMode
    const resolvedMode: RunMode =
      mode !== undefined && isValidMode(mode) ? mode : (topic.digest_mode as RunMode);

    // Pre-flight quota check for subscription providers
    const llmSettings = await db.llmSettings.get();
    const effectiveProvider = resolvedProviderOverride?.provider ?? llmSettings.provider;

    if (effectiveProvider === "claude-subscription" || effectiveProvider === "codex-subscription") {
      // Count enabled sources for this topic
      const sources = await db.sources.listByUserAndTopic({
        userId: ctx.userId,
        topicId: targetTopicId,
      });
      const enabledSourceCount = sources.filter((s) => s.is_enabled).length;

      // Compile digest plan to get expected triage calls
      const digestPlan = compileDigestPlan({
        mode: resolvedMode as BudgetTier,
        digestDepth: topic.digest_depth ?? 50,
        enabledSourceCount,
      });

      // Check quota
      const quotaCheck = checkQuotaForRun({
        provider: effectiveProvider,
        expectedCalls: digestPlan.triageMaxCalls,
        claudeCallsPerHour: llmSettings.claude_calls_per_hour,
        codexCallsPerHour: llmSettings.codex_calls_per_hour,
      });

      if (!quotaCheck.ok) {
        return reply.code(429).send({
          ok: false,
          error: {
            code: "QUOTA_EXCEEDED",
            message: quotaCheck.error,
            remainingQuota: quotaCheck.remainingQuota,
            expectedCalls: quotaCheck.expectedCalls,
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

      // Check if it's just a weight update (backwards compatible)
      const patchKeys = Object.keys(patch);
      if (patchKeys.length === 1 && "weight" in patch) {
        await db.sources.updateConfigWeight({
          sourceId: id,
          weight: patch.weight as number | null,
        });
      } else {
        // Full config update - merge with existing config
        const existingConfig = existing.config_json ?? {};
        const mergedConfig = { ...existingConfig, ...patch };

        // Apply weight clamping if weight is being updated
        if ("weight" in patch && patch.weight !== null) {
          mergedConfig.weight = Math.max(0.1, Math.min(3.0, patch.weight as number));
        }

        await db.sources.updateConfig({
          sourceId: id,
          config: mergedConfig,
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
        codexSubscriptionEnabled: settings.codex_subscription_enabled,
        codexCallsPerHour: settings.codex_calls_per_hour,
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
      codexSubscriptionEnabled,
      codexCallsPerHour,
    } = body as Record<string, unknown>;

    // Validate provider if provided
    const validProviders: LlmProvider[] = [
      "openai",
      "anthropic",
      "claude-subscription",
      "codex-subscription",
    ];
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

    // Validate Codex subscription fields
    if (codexSubscriptionEnabled !== undefined && typeof codexSubscriptionEnabled !== "boolean") {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "INVALID_PARAM",
          message: "codexSubscriptionEnabled must be a boolean",
        },
      });
    }

    if (codexCallsPerHour !== undefined) {
      if (
        typeof codexCallsPerHour !== "number" ||
        !Number.isInteger(codexCallsPerHour) ||
        codexCallsPerHour < 1
      ) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: "INVALID_PARAM",
            message: "codexCallsPerHour must be a positive integer",
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
    if (codexSubscriptionEnabled !== undefined)
      updateParams.codex_subscription_enabled = codexSubscriptionEnabled as boolean;
    if (codexCallsPerHour !== undefined)
      updateParams.codex_calls_per_hour = codexCallsPerHour as number;

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
        codexSubscriptionEnabled: settings.codex_subscription_enabled,
        codexCallsPerHour: settings.codex_calls_per_hour,
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
        // mode only exists on RunWindowJobData, runId only on RunAbtestJobData
        mode: "mode" in job.data ? job.data.mode : undefined,
        runId: "runId" in job.data ? job.data.runId : undefined,
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

  // GET /admin/env-config - Get important non-secret environment variables
  fastify.get("/admin/env-config", async (request, reply) => {
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

    // Collect important env vars (non-secrets only)
    const parseIntOrNull = (val: string | undefined): number | null => {
      if (!val) return null;
      const parsed = Number.parseInt(val, 10);
      return Number.isFinite(parsed) ? parsed : null;
    };

    const envConfig = {
      // App config
      appEnv: process.env.APP_ENV ?? "production",
      appTimezone: process.env.APP_TIMEZONE ?? "UTC",
      appUrl: process.env.APP_URL ?? null,
      qaEnabled: process.env.QA_ENABLED === "true",

      // Budget limits
      monthlyCredits: parseIntOrNull(process.env.MONTHLY_CREDITS) ?? 10000,
      dailyThrottleCredits: parseIntOrNull(process.env.DAILY_THROTTLE_CREDITS),
      defaultTier: process.env.DEFAULT_TIER ?? "normal",

      // X/Twitter fetch limits
      xPostsMaxSearchCallsPerRun:
        parseIntOrNull(process.env.X_POSTS_MAX_SEARCH_CALLS_PER_RUN) ??
        parseIntOrNull(process.env.SIGNAL_MAX_SEARCH_CALLS_PER_RUN),

      // LLM config - OpenAI
      openaiBaseUrl: process.env.OPENAI_BASE_URL ?? null,
      openaiTriageModel: process.env.OPENAI_TRIAGE_MODEL ?? null,
      openaiTriageMaxTokens: parseIntOrNull(process.env.OPENAI_TRIAGE_MAX_OUTPUT_TOKENS),
      openaiEmbedModel: process.env.OPENAI_EMBED_MODEL ?? null,

      // LLM config - Grok
      grokBaseUrl: process.env.GROK_BASE_URL ?? null,
      signalGrokModel: process.env.SIGNAL_GROK_MODEL ?? null,
    };

    // Generate warnings for problematic configurations
    const warnings: string[] = [];

    if (envConfig.xPostsMaxSearchCallsPerRun !== null) {
      warnings.push(
        `X_POSTS_MAX_SEARCH_CALLS_PER_RUN is set to ${envConfig.xPostsMaxSearchCallsPerRun}. ` +
          `This limits how many Twitter accounts are queried per fetch. ` +
          `Set higher or unset to fetch from all accounts.`,
      );
    }

    return {
      ok: true,
      config: envConfig,
      warnings,
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

  // =========================================================================
  // AB Test Endpoints
  // =========================================================================

  /**
   * Check if AB tests are enabled via environment variable.
   */
  function isAbtestsEnabled(): boolean {
    const value = process.env.ENABLE_ABTESTS;
    return value === "true" || value === "1";
  }

  // Valid providers for AB test variants
  const ABTEST_VALID_PROVIDERS = [
    "openai",
    "anthropic",
    "claude-subscription",
    "codex-subscription",
  ] as const;
  type AbtestProvider = (typeof ABTEST_VALID_PROVIDERS)[number];

  function isValidAbtestProvider(value: unknown): value is AbtestProvider {
    return typeof value === "string" && ABTEST_VALID_PROVIDERS.includes(value as AbtestProvider);
  }

  // POST /admin/abtests - Create and enqueue an AB test run
  fastify.post("/admin/abtests", async (request, reply) => {
    // Check if feature is enabled
    if (!isAbtestsEnabled()) {
      return reply.code(403).send({
        ok: false,
        error: {
          code: "FEATURE_DISABLED",
          message: "AB tests are disabled. Set ENABLE_ABTESTS=true to enable.",
        },
      });
    }

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

    const { topicId, windowStart, windowEnd, variants, maxItems } = body as Record<string, unknown>;

    // Validate topicId
    if (!isValidUuid(topicId)) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "INVALID_PARAM",
          message: "topicId must be a valid UUID",
        },
      });
    }

    // Validate window dates
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

    if (new Date(windowStart as string) >= new Date(windowEnd as string)) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "INVALID_PARAM",
          message: "windowStart must be before windowEnd",
        },
      });
    }

    // Validate variants array
    if (!Array.isArray(variants) || variants.length < 2) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "INVALID_PARAM",
          message: "variants must be an array with at least 2 configurations",
        },
      });
    }

    // Validate each variant
    const validatedVariants: AbtestVariantConfig[] = [];
    for (let i = 0; i < variants.length; i++) {
      const v = variants[i] as Record<string, unknown>;
      if (!v || typeof v !== "object") {
        return reply.code(400).send({
          ok: false,
          error: {
            code: "INVALID_PARAM",
            message: `variants[${i}] must be an object`,
          },
        });
      }

      if (typeof v.name !== "string" || v.name.trim().length === 0) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: "INVALID_PARAM",
            message: `variants[${i}].name must be a non-empty string`,
          },
        });
      }

      if (!isValidAbtestProvider(v.provider)) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: "INVALID_PARAM",
            message: `variants[${i}].provider must be one of: ${ABTEST_VALID_PROVIDERS.join(", ")}`,
          },
        });
      }

      if (typeof v.model !== "string" || v.model.trim().length === 0) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: "INVALID_PARAM",
            message: `variants[${i}].model must be a non-empty string`,
          },
        });
      }

      // Validate optional reasoningEffort
      const validReasoningEfforts = ["low", "medium", "high", null, undefined];
      if (
        v.reasoningEffort !== undefined &&
        !validReasoningEfforts.includes(v.reasoningEffort as string | null)
      ) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: "INVALID_PARAM",
            message: `variants[${i}].reasoningEffort must be one of: low, medium, high, or null`,
          },
        });
      }

      // Validate optional maxOutputTokens
      if (v.maxOutputTokens !== undefined) {
        if (
          typeof v.maxOutputTokens !== "number" ||
          !Number.isInteger(v.maxOutputTokens) ||
          v.maxOutputTokens < 1
        ) {
          return reply.code(400).send({
            ok: false,
            error: {
              code: "INVALID_PARAM",
              message: `variants[${i}].maxOutputTokens must be a positive integer`,
            },
          });
        }
      }

      validatedVariants.push({
        name: (v.name as string).trim(),
        provider: v.provider as AbtestProvider,
        model: (v.model as string).trim(),
        reasoningEffort: (v.reasoningEffort as "low" | "medium" | "high" | null) ?? null,
        maxOutputTokens: v.maxOutputTokens as number | undefined,
      });
    }

    // Validate optional maxItems
    let resolvedMaxItems = 50; // Default
    if (maxItems !== undefined) {
      if (typeof maxItems !== "number" || !Number.isInteger(maxItems) || maxItems < 1) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: "INVALID_PARAM",
            message: "maxItems must be a positive integer",
          },
        });
      }
      resolvedMaxItems = Math.min(maxItems, 200); // Cap at 200
    }

    // Verify topic belongs to user
    const db = getDb();
    const topic = await db.topics.getById(topicId as string);
    if (!topic || topic.user_id !== ctx.userId) {
      return reply.code(403).send({
        ok: false,
        error: {
          code: "FORBIDDEN",
          message: "Topic does not belong to current user",
        },
      });
    }

    // Create the AB test run in the database
    const run = await db.abtests.createRun({
      userId: ctx.userId,
      topicId: topicId as string,
      windowStart: windowStart as string,
      windowEnd: windowEnd as string,
      configJson: {
        maxItems: resolvedMaxItems,
        variantCount: validatedVariants.length,
      },
    });

    // Enqueue the job
    const queue = getPipelineQueue();
    const jobId = `${RUN_ABTEST_JOB_NAME}_${run.id}`;

    await queue.add(
      RUN_ABTEST_JOB_NAME,
      {
        runId: run.id,
        userId: ctx.userId,
        topicId: topicId as string,
        windowStart: windowStart as string,
        windowEnd: windowEnd as string,
        variants: validatedVariants,
        maxItems: resolvedMaxItems,
      },
      {
        jobId,
        removeOnComplete: 50,
        removeOnFail: 20,
      },
    );

    return reply.code(201).send({
      ok: true,
      runId: run.id,
      jobId,
    });
  });

  // GET /admin/abtests - List recent AB test runs
  fastify.get("/admin/abtests", async (_request, reply) => {
    // Check if feature is enabled
    if (!isAbtestsEnabled()) {
      return reply.code(403).send({
        ok: false,
        error: {
          code: "FEATURE_DISABLED",
          message: "AB tests are disabled. Set ENABLE_ABTESTS=true to enable.",
        },
      });
    }

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
    const runs = await db.abtests.listRuns({ userId: ctx.userId, limit: 20 });

    return {
      ok: true,
      runs: runs.map((r) => ({
        id: r.id,
        topicId: r.topic_id,
        windowStart: r.window_start,
        windowEnd: r.window_end,
        status: r.status,
        config: r.config_json,
        createdAt: r.created_at,
        startedAt: r.started_at,
        completedAt: r.completed_at,
      })),
    };
  });

  // GET /admin/abtests/:id - Get AB test run details
  fastify.get<{ Params: { id: string } }>("/admin/abtests/:id", async (request, reply) => {
    // Check if feature is enabled
    if (!isAbtestsEnabled()) {
      return reply.code(403).send({
        ok: false,
        error: {
          code: "FEATURE_DISABLED",
          message: "AB tests are disabled. Set ENABLE_ABTESTS=true to enable.",
        },
      });
    }

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
    const detail = await db.abtests.getRunDetail(id);

    if (!detail) {
      return reply.code(404).send({
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: "AB test run not found",
        },
      });
    }

    // Verify ownership
    if (detail.run.user_id !== ctx.userId) {
      return reply.code(403).send({
        ok: false,
        error: {
          code: "FORBIDDEN",
          message: "AB test run does not belong to current user",
        },
      });
    }

    return {
      ok: true,
      run: {
        id: detail.run.id,
        topicId: detail.run.topic_id,
        windowStart: detail.run.window_start,
        windowEnd: detail.run.window_end,
        status: detail.run.status,
        config: detail.run.config_json,
        createdAt: detail.run.created_at,
        startedAt: detail.run.started_at,
        completedAt: detail.run.completed_at,
      },
      variants: detail.variants.map((v) => ({
        id: v.id,
        name: v.name,
        provider: v.provider,
        model: v.model,
        reasoningEffort: v.reasoning_effort,
        maxOutputTokens: v.max_output_tokens,
        order: v.order,
      })),
      items: detail.items.map((item) => ({
        id: item.id,
        candidateId: item.candidate_id,
        clusterId: item.cluster_id,
        contentItemId: item.content_item_id,
        representativeContentItemId: item.representative_content_item_id,
        sourceId: item.source_id,
        sourceType: item.source_type,
        title: item.title,
        url: item.url,
        author: item.author,
        publishedAt: item.published_at,
      })),
      results: detail.results.map((r) => ({
        id: r.id,
        abtestItemId: r.abtest_item_id,
        variantId: r.variant_id,
        triage: r.triage_json,
        inputTokens: r.input_tokens,
        outputTokens: r.output_tokens,
        status: r.status,
        error: r.error_json,
        createdAt: r.created_at,
      })),
    };
  });
}
