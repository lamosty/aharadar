import type { LlmProvider, LlmSettingsUpdate, ReasoningEffort, SourceRow } from "@aharadar/db";
import { checkQuotaForRun, getQuotaStatusAsync } from "@aharadar/llm";
import {
  applyThemeLabelOverrides,
  clusterTriageThemesIntoLabels,
  compileDigestPlan,
  computeCreditsStatus,
  resetBudget,
} from "@aharadar/pipeline";
import {
  type AbtestVariantConfig,
  clearEmergencyStop,
  createRedisClient,
  isEmergencyStopActive,
  type ProviderOverride,
  RUN_ABTEST_JOB_NAME,
  RUN_WINDOW_JOB_NAME,
  setEmergencyStop,
} from "@aharadar/queues";
import type { BudgetTier, XAccountPolicyMode } from "@aharadar/shared";
import {
  computePolicyView,
  loadRuntimeEnv,
  normalizeHandle,
  type OpsLinks,
  parseThemeTuning,
} from "@aharadar/shared";
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

function asVectorLiteral(vector: number[]): string {
  return `[${vector.map((n) => (Number.isFinite(n) ? n : 0)).join(",")}]`;
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
const SUPPORTED_SOURCE_TYPES = [
  "reddit",
  "hn",
  "rss",
  "x_posts",
  "youtube",
  "sec_edgar",
  "congress_trading",
  "polymarket",
  "options_flow",
  "market_sentiment",
  "podcast",
  "substack",
  "medium",
  "arxiv",
  "lobsters",
  "producthunt",
  "github_releases",
  "telegram",
] as const;
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
    const validProviders = [
      "openai",
      "anthropic",
      "claude-subscription",
      "codex-subscription",
    ] as const;
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

      // Calculate actual expected LLM calls (accounting for batching)
      // Batching divides total items by batch size
      let expectedLlmCalls = digestPlan.triageMaxCalls;
      if (llmSettings.triage_batch_enabled && llmSettings.triage_batch_size > 1) {
        expectedLlmCalls = Math.ceil(digestPlan.triageMaxCalls / llmSettings.triage_batch_size);
      }

      // Check quota
      const quotaCheck = checkQuotaForRun({
        provider: effectiveProvider,
        expectedCalls: expectedLlmCalls,
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

  // POST /admin/topics/:id/regenerate-themes - Recompute theme labels for latest items
  fastify.post<{ Params: { id: string } }>(
    "/admin/topics/:id/regenerate-themes",
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

      const db = getDb();
      const topic = await db.topics.getById(id);
      if (!topic) {
        return reply.code(404).send({
          ok: false,
          error: {
            code: "NOT_FOUND",
            message: `Topic not found: ${id}`,
          },
        });
      }
      if (topic.user_id !== ctx.userId) {
        return reply.code(403).send({
          ok: false,
          error: {
            code: "FORBIDDEN",
            message: "Topic does not belong to current user",
          },
        });
      }

      const themeTuning = parseThemeTuning(topic.custom_settings?.theme_tuning_v1);
      if (!themeTuning.enabled) {
        return {
          ok: true,
          message: "Theme grouping is disabled for this topic. No changes applied.",
          result: {
            attempted: 0,
            attachedToExisting: 0,
            created: 0,
            skipped: 0,
            errors: 0,
          },
        };
      }

      const limit = 2000;
      const latestItems = await db.query<{
        digest_item_id: string;
        triage_json: Record<string, unknown> | null;
      }>(
        `WITH latest_items AS (
           SELECT DISTINCT ON (COALESCE(di.content_item_id, c.representative_content_item_id))
             di.id::text as digest_item_id,
             di.triage_json
           FROM digest_items di
           JOIN digests d ON d.id = di.digest_id
           LEFT JOIN clusters c ON c.id = di.cluster_id
           WHERE d.user_id = $1
             AND d.topic_id = $2::uuid
           ORDER BY COALESCE(di.content_item_id, c.representative_content_item_id), d.created_at DESC
         )
         SELECT digest_item_id, triage_json
         FROM latest_items
         WHERE triage_json IS NOT NULL
         LIMIT $3`,
        [ctx.userId, id, limit],
      );

      if (latestItems.rows.length === 0) {
        return {
          ok: true,
          message: "No triaged items found to regenerate themes.",
          result: {
            attempted: 0,
            attachedToExisting: 0,
            created: 0,
            skipped: 0,
            errors: 0,
          },
        };
      }

      const inputs = latestItems.rows.map((row) => {
        const triage = row.triage_json as { theme?: string; topic?: string } | null;
        const topicLabel = triage?.theme ?? triage?.topic ?? "Uncategorized";
        return {
          candidateId: row.digest_item_id,
          topic: topicLabel,
        };
      });

      let clusterResult: Awaited<ReturnType<typeof clusterTriageThemesIntoLabels>>;
      try {
        clusterResult = await clusterTriageThemesIntoLabels(
          inputs,
          (topic.digest_mode as BudgetTier) ?? "normal",
          themeTuning.similarityThreshold,
        );
        clusterResult = applyThemeLabelOverrides(clusterResult, {
          minLabelWords: themeTuning.minLabelWords,
          maxDominancePct: themeTuning.maxDominancePct,
          baseThreshold: themeTuning.similarityThreshold,
        });
      } catch (err) {
        return reply.code(500).send({
          ok: false,
          error: {
            code: "THEME_REGEN_FAILED",
            message: err instanceof Error ? err.message : String(err),
          },
        });
      }

      let errors = 0;
      await db.tx(async (tx) => {
        for (const item of clusterResult.items) {
          const vectorLiteral = item.vector.length > 0 ? asVectorLiteral(item.vector) : null;
          try {
            await tx.query(
              `UPDATE digest_items
               SET triage_theme_vector = $2::vector,
                   theme_label = $3
               WHERE id = $1::uuid`,
              [item.candidateId, vectorLiteral, item.themeLabel],
            );
          } catch (err) {
            errors += 1;
          }
        }
      });

      const uniqueLabels = new Set(clusterResult.items.map((i) => i.themeLabel));
      const attachedToExisting = clusterResult.items.filter((i) => i.themeLabel !== i.topic).length;

      return {
        ok: true,
        message: `Regenerated theme labels for ${clusterResult.items.length} items.`,
        result: {
          attempted: clusterResult.items.length,
          attachedToExisting,
          created: uniqueLabels.size,
          skipped: 0,
          errors,
        },
      };
    },
  );

  fastify.get<{ Params: { id: string } }>(
    "/admin/topics/:id/embedding-retention",
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

      const db = getDb();
      const topic = await db.topics.getById(id);
      if (!topic) {
        return reply.code(404).send({
          ok: false,
          error: {
            code: "NOT_FOUND",
            message: `Topic not found: ${id}`,
          },
        });
      }
      if (topic.user_id !== ctx.userId) {
        return reply.code(403).send({
          ok: false,
          error: {
            code: "FORBIDDEN",
            message: "Topic does not belong to current user",
          },
        });
      }

      const latest = await db.embeddingRetentionRuns.getLatestForTopic({
        userId: ctx.userId,
        topicId: id,
      });

      return {
        ok: true,
        run: latest
          ? {
              id: latest.id,
              topicId: latest.topic_id,
              windowEnd: latest.window_end,
              maxAgeDays: latest.max_age_days,
              maxItems: latest.max_items,
              maxTokens: latest.max_tokens,
              effectiveMaxAgeDays: latest.effective_max_age_days,
              cutoffAt: latest.cutoff_at,
              deletedByAge: latest.deleted_by_age,
              deletedByMaxTokens: latest.deleted_by_max_tokens,
              deletedByMaxItems: latest.deleted_by_max_items,
              totalDeleted: latest.total_deleted,
              createdAt: latest.created_at,
            }
          : null,
      };
    },
  );

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

  // POST /admin/budgets/reset - Reset daily or monthly budget
  fastify.post("/admin/budgets/reset", async (request, reply) => {
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

    const body = request.body as { period?: unknown };
    const period = body?.period;

    if (period !== "daily" && period !== "monthly") {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "INVALID_PERIOD",
          message: "period must be 'daily' or 'monthly'",
        },
      });
    }

    const monthlyCredits = Number.parseInt(process.env.MONTHLY_CREDITS ?? "10000", 10);
    const dailyThrottleCreditsStr = process.env.DAILY_THROTTLE_CREDITS;
    const dailyThrottleCredits = dailyThrottleCreditsStr
      ? Number.parseInt(dailyThrottleCreditsStr, 10)
      : undefined;

    const result = await resetBudget({
      db: getDb(),
      userId: ctx.userId,
      period,
      monthlyCredits,
      dailyThrottleCredits,
    });

    return {
      ok: true,
      reset: result,
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
        deepSummaryEnabled: settings.deep_summary_enabled,
        claudeSubscriptionEnabled: settings.claude_subscription_enabled,
        claudeTriageThinking: settings.claude_triage_thinking,
        claudeCallsPerHour: settings.claude_calls_per_hour,
        codexSubscriptionEnabled: settings.codex_subscription_enabled,
        codexCallsPerHour: settings.codex_calls_per_hour,
        reasoningEffort: settings.reasoning_effort,
        triageBatchEnabled: settings.triage_batch_enabled,
        triageBatchSize: settings.triage_batch_size,
        updatedAt: settings.updated_at,
      },
    };
  });

  // GET /admin/llm/quota - Get current subscription quota status
  fastify.get("/admin/llm/quota", async (_request, reply) => {
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

    // Get quota status from Redis (shared between API and worker)
    const quotaStatus = await getQuotaStatusAsync({
      claudeCallsPerHour: settings.claude_calls_per_hour,
      codexCallsPerHour: settings.codex_calls_per_hour,
    });

    return {
      ok: true,
      quota: quotaStatus,
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
      deepSummaryEnabled,
      claudeSubscriptionEnabled,
      claudeTriageThinking,
      claudeCallsPerHour,
      codexSubscriptionEnabled,
      codexCallsPerHour,
      reasoningEffort,
      triageBatchEnabled,
      triageBatchSize,
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

    if (deepSummaryEnabled !== undefined && typeof deepSummaryEnabled !== "boolean") {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "INVALID_PARAM",
          message: "deepSummaryEnabled must be a boolean",
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

    // Validate reasoning effort
    const validReasoningEfforts = ["none", "low", "medium", "high"];
    if (
      reasoningEffort !== undefined &&
      !validReasoningEfforts.includes(reasoningEffort as string)
    ) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "INVALID_PARAM",
          message: `reasoningEffort must be one of: ${validReasoningEfforts.join(", ")}`,
        },
      });
    }

    // Validate batch triage settings
    if (triageBatchEnabled !== undefined && typeof triageBatchEnabled !== "boolean") {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "INVALID_PARAM",
          message: "triageBatchEnabled must be a boolean",
        },
      });
    }

    if (triageBatchSize !== undefined) {
      if (
        typeof triageBatchSize !== "number" ||
        !Number.isInteger(triageBatchSize) ||
        triageBatchSize < 1 ||
        triageBatchSize > 50
      ) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: "INVALID_PARAM",
            message: "triageBatchSize must be an integer between 1 and 50",
          },
        });
      }
    }

    // Build update params
    const updateParams: LlmSettingsUpdate = {};
    if (provider !== undefined) updateParams.provider = provider as LlmProvider;
    if (anthropicModel !== undefined) updateParams.anthropic_model = anthropicModel as string;
    if (openaiModel !== undefined) updateParams.openai_model = openaiModel as string;
    if (deepSummaryEnabled !== undefined)
      updateParams.deep_summary_enabled = deepSummaryEnabled as boolean;
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
    if (reasoningEffort !== undefined)
      updateParams.reasoning_effort = reasoningEffort as ReasoningEffort;
    if (triageBatchEnabled !== undefined)
      updateParams.triage_batch_enabled = triageBatchEnabled as boolean;
    if (triageBatchSize !== undefined) updateParams.triage_batch_size = triageBatchSize as number;

    const db = getDb();
    const settings = await db.llmSettings.update(updateParams);

    return {
      ok: true,
      settings: {
        provider: settings.provider,
        anthropicModel: settings.anthropic_model,
        openaiModel: settings.openai_model,
        deepSummaryEnabled: settings.deep_summary_enabled,
        claudeSubscriptionEnabled: settings.claude_subscription_enabled,
        claudeTriageThinking: settings.claude_triage_thinking,
        claudeCallsPerHour: settings.claude_calls_per_hour,
        codexSubscriptionEnabled: settings.codex_subscription_enabled,
        codexCallsPerHour: settings.codex_calls_per_hour,
        reasoningEffort: settings.reasoning_effort,
        triageBatchEnabled: settings.triage_batch_enabled,
        triageBatchSize: settings.triage_batch_size,
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

    // Get active and waiting jobs, and paused state
    const [activeJobs, waitingJobs, isPaused] = await Promise.all([
      queue.getJobs(["active"]),
      queue.getJobs(["waiting", "delayed"]),
      queue.isPaused(),
    ]);

    // Format job info
    const formatJob = (job: Awaited<ReturnType<typeof queue.getJobs>>[number]) => ({
      id: job.id,
      name: job.name,
      data: {
        // windowStart/windowEnd exist on RunWindowJobData and RunAbtestJobData
        topicId: "topicId" in job.data ? job.data.topicId : undefined,
        windowStart: "windowStart" in job.data ? job.data.windowStart : undefined,
        windowEnd: "windowEnd" in job.data ? job.data.windowEnd : undefined,
        // mode only exists on RunWindowJobData, runId only on RunAbtestJobData
        mode: "mode" in job.data ? job.data.mode : undefined,
        runId: "runId" in job.data ? job.data.runId : undefined,
        // scopeType only exists on RunAggregateSummaryJob
        scopeType: "scopeType" in job.data ? job.data.scopeType : undefined,
      },
      progress: job.progress,
      attemptsMade: job.attemptsMade,
      timestamp: job.timestamp,
      processedOn: job.processedOn,
    });

    return {
      ok: true,
      queue: {
        isPaused,
        active: activeJobs.map(formatJob),
        waiting: waitingJobs.map(formatJob),
        counts: {
          active: activeJobs.length,
          waiting: waitingJobs.length,
        },
      },
    };
  });

  // POST /admin/queue/obliterate - Force obliterate the queue (removes all jobs)
  fastify.post("/admin/queue/obliterate", async (_request, reply) => {
    const queue = getPipelineQueue();

    try {
      await queue.obliterate({ force: true });
      return { ok: true, message: "Queue obliterated" };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return reply.code(500).send({
        ok: false,
        error: { code: "OBLITERATE_FAILED", message },
      });
    }
  });

  // POST /admin/queue/drain - Remove all waiting jobs (keeps active jobs)
  fastify.post("/admin/queue/drain", async (_request, reply) => {
    const queue = getPipelineQueue();

    try {
      await queue.drain();
      return { ok: true, message: "Queue drained (waiting jobs removed)" };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return reply.code(500).send({
        ok: false,
        error: { code: "DRAIN_FAILED", message },
      });
    }
  });

  // POST /admin/queue/pause - Pause the queue
  fastify.post("/admin/queue/pause", async (_request, reply) => {
    const queue = getPipelineQueue();

    try {
      await queue.pause();
      return { ok: true, message: "Queue paused" };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return reply.code(500).send({
        ok: false,
        error: { code: "PAUSE_FAILED", message },
      });
    }
  });

  // POST /admin/queue/resume - Resume the queue
  fastify.post("/admin/queue/resume", async (_request, reply) => {
    const queue = getPipelineQueue();

    try {
      await queue.resume();
      return { ok: true, message: "Queue resumed" };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return reply.code(500).send({
        ok: false,
        error: { code: "RESUME_FAILED", message },
      });
    }
  });

  // DELETE /admin/queue/job/:jobId - Remove a specific job
  fastify.delete<{ Params: { jobId: string } }>(
    "/admin/queue/job/:jobId",
    async (request, reply) => {
      const queue = getPipelineQueue();
      const { jobId } = request.params;

      try {
        const job = await queue.getJob(jobId);
        if (!job) {
          return reply.code(404).send({
            ok: false,
            error: { code: "JOB_NOT_FOUND", message: `Job ${jobId} not found` },
          });
        }

        // Try to remove - this works for waiting/delayed jobs
        // For active jobs, we need to use moveToFailed
        const state = await job.getState();
        if (state === "active") {
          // Move active job to failed state so it stops processing
          await job.moveToFailed(new Error("Manually killed via admin API"), "0", true);
        } else {
          await job.remove();
        }

        return { ok: true, message: `Job ${jobId} removed (was ${state})` };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return reply.code(500).send({
          ok: false,
          error: { code: "REMOVE_JOB_FAILED", message },
        });
      }
    },
  );

  // POST /admin/queue/emergency-stop - Trigger emergency stop (obliterate + signal workers to exit)
  fastify.post("/admin/queue/emergency-stop", async (_request, reply) => {
    const env = loadRuntimeEnv();
    const redis = createRedisClient(env.redisUrl);
    const queue = getPipelineQueue();

    try {
      // Set emergency stop flag first (workers will see this and exit)
      await setEmergencyStop(redis);

      // Then obliterate the queue
      await queue.obliterate({ force: true });

      return {
        ok: true,
        message: "Emergency stop activated. Workers will exit when they check the flag.",
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return reply.code(500).send({
        ok: false,
        error: { code: "EMERGENCY_STOP_FAILED", message },
      });
    } finally {
      await redis.quit();
    }
  });

  // POST /admin/queue/clear-emergency-stop - Clear the emergency stop flag
  fastify.post("/admin/queue/clear-emergency-stop", async (_request, reply) => {
    const env = loadRuntimeEnv();
    const redis = createRedisClient(env.redisUrl);

    try {
      await clearEmergencyStop(redis);
      return { ok: true, message: "Emergency stop cleared. Workers can start again." };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return reply.code(500).send({
        ok: false,
        error: { code: "CLEAR_EMERGENCY_STOP_FAILED", message },
      });
    } finally {
      await redis.quit();
    }
  });

  // GET /admin/queue/emergency-stop-status - Check if emergency stop is active
  fastify.get("/admin/queue/emergency-stop-status", async (_request, reply) => {
    const env = loadRuntimeEnv();
    const redis = createRedisClient(env.redisUrl);

    try {
      const isActive = await isEmergencyStopActive(redis);
      return { ok: true, emergencyStopActive: isActive };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return reply.code(500).send({
        ok: false,
        error: { code: "CHECK_EMERGENCY_STOP_FAILED", message },
      });
    } finally {
      await redis.quit();
    }
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
      const validReasoningEfforts = ["none", "low", "medium", "high", null, undefined];
      if (
        v.reasoningEffort !== undefined &&
        !validReasoningEfforts.includes(v.reasoningEffort as string | null)
      ) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: "INVALID_PARAM",
            message: `variants[${i}].reasoningEffort must be one of: none, low, medium, high, or null`,
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
        reasoningEffort: (v.reasoningEffort as "none" | "low" | "medium" | "high" | null) ?? null,
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

  // =========================================================================
  // X Account Policy Endpoints
  // =========================================================================

  // Valid modes for X account policies
  const VALID_POLICY_MODES: XAccountPolicyMode[] = ["auto", "always", "mute"];

  function isValidPolicyMode(value: unknown): value is XAccountPolicyMode {
    return typeof value === "string" && VALID_POLICY_MODES.includes(value as XAccountPolicyMode);
  }

  /**
   * Extract account handles from x_posts source config.
   * Gets handles from both 'accounts' array and 'batching.groups'.
   */
  function extractHandlesFromXPostsConfig(config: Record<string, unknown>): string[] {
    const handles = new Set<string>();

    // Extract from 'accounts' array
    if (Array.isArray(config.accounts)) {
      for (const acc of config.accounts) {
        if (typeof acc === "string" && acc.trim()) {
          handles.add(normalizeHandle(acc.trim()));
        }
      }
    }

    // Extract from 'batching.groups' (array of arrays)
    const batching = config.batching as { groups?: unknown[] } | undefined;
    if (batching && Array.isArray(batching.groups)) {
      for (const group of batching.groups) {
        if (Array.isArray(group)) {
          for (const acc of group) {
            if (typeof acc === "string" && acc.trim()) {
              handles.add(normalizeHandle(acc.trim()));
            }
          }
        }
      }
    }

    return Array.from(handles).sort();
  }

  // GET /admin/sources/:id/x-account-policies - List X account policies for a source
  fastify.get<{ Params: { id: string } }>(
    "/admin/sources/:id/x-account-policies",
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

      const db = getDb();
      const source = await db.sources.getById(id);

      if (!source) {
        return reply.code(404).send({
          ok: false,
          error: {
            code: "NOT_FOUND",
            message: `Source not found: ${id}`,
          },
        });
      }

      // Verify ownership
      if (source.user_id !== ctx.userId) {
        return reply.code(403).send({
          ok: false,
          error: {
            code: "FORBIDDEN",
            message: "Source does not belong to current user",
          },
        });
      }

      // Only x_posts sources have account policies
      if (source.type !== "x_posts") {
        return reply.code(400).send({
          ok: false,
          error: {
            code: "INVALID_SOURCE_TYPE",
            message: "X account policies are only available for x_posts sources",
          },
        });
      }

      // Extract handles from config
      const config = (source.config_json ?? {}) as Record<string, unknown>;
      const handles = extractHandlesFromXPostsConfig(config);

      if (handles.length === 0) {
        return {
          ok: true,
          policies: [],
          reason: "No accounts configured in source",
        };
      }

      // Upsert defaults to ensure all handles have a row
      const rows = await db.xAccountPolicies.upsertDefaults({
        sourceId: id,
        handles,
      });

      // Compute views
      const now = new Date();
      const policies = rows.map((row) => computePolicyView(row, now));

      return {
        ok: true,
        policies,
      };
    },
  );

  // PATCH /admin/sources/:id/x-account-policies/mode - Update policy mode for an account
  fastify.patch<{ Params: { id: string }; Body: { handle: string; mode: XAccountPolicyMode } }>(
    "/admin/sources/:id/x-account-policies/mode",
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

      const { handle, mode } = body as Record<string, unknown>;

      if (typeof handle !== "string" || !handle.trim()) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: "INVALID_PARAM",
            message: "handle is required and must be a non-empty string",
          },
        });
      }

      if (!isValidPolicyMode(mode)) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: "INVALID_PARAM",
            message: `mode must be one of: ${VALID_POLICY_MODES.join(", ")}`,
          },
        });
      }

      const db = getDb();
      const source = await db.sources.getById(id);

      if (!source) {
        return reply.code(404).send({
          ok: false,
          error: {
            code: "NOT_FOUND",
            message: `Source not found: ${id}`,
          },
        });
      }

      if (source.user_id !== ctx.userId) {
        return reply.code(403).send({
          ok: false,
          error: {
            code: "FORBIDDEN",
            message: "Source does not belong to current user",
          },
        });
      }

      if (source.type !== "x_posts") {
        return reply.code(400).send({
          ok: false,
          error: {
            code: "INVALID_SOURCE_TYPE",
            message: "X account policies are only available for x_posts sources",
          },
        });
      }

      const normalizedHandle = normalizeHandle(handle);

      // Ensure policy row exists
      await db.xAccountPolicies.upsertDefaults({
        sourceId: id,
        handles: [normalizedHandle],
      });

      // Update mode
      const updated = await db.xAccountPolicies.updateMode({
        sourceId: id,
        handle: normalizedHandle,
        mode,
      });

      if (!updated) {
        return reply.code(404).send({
          ok: false,
          error: {
            code: "NOT_FOUND",
            message: `Policy not found for handle: ${handle}`,
          },
        });
      }

      const now = new Date();
      const view = computePolicyView(updated, now);

      return {
        ok: true,
        policy: view,
      };
    },
  );

  // POST /admin/sources/:id/x-account-policies/reset - Reset policy stats for an account
  fastify.post<{ Params: { id: string }; Body: { handle: string } }>(
    "/admin/sources/:id/x-account-policies/reset",
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

      const { handle } = body as Record<string, unknown>;

      if (typeof handle !== "string" || !handle.trim()) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: "INVALID_PARAM",
            message: "handle is required and must be a non-empty string",
          },
        });
      }

      const db = getDb();
      const source = await db.sources.getById(id);

      if (!source) {
        return reply.code(404).send({
          ok: false,
          error: {
            code: "NOT_FOUND",
            message: `Source not found: ${id}`,
          },
        });
      }

      if (source.user_id !== ctx.userId) {
        return reply.code(403).send({
          ok: false,
          error: {
            code: "FORBIDDEN",
            message: "Source does not belong to current user",
          },
        });
      }

      if (source.type !== "x_posts") {
        return reply.code(400).send({
          ok: false,
          error: {
            code: "INVALID_SOURCE_TYPE",
            message: "X account policies are only available for x_posts sources",
          },
        });
      }

      const normalizedHandle = normalizeHandle(handle);

      // Reset policy stats (zeros pos/neg scores, clears last_feedback_at)
      const reset = await db.xAccountPolicies.resetPolicy({
        sourceId: id,
        handle: normalizedHandle,
      });

      if (!reset) {
        return reply.code(404).send({
          ok: false,
          error: {
            code: "NOT_FOUND",
            message: `Policy not found for handle: ${handle}`,
          },
        });
      }

      const now = new Date();
      const view = computePolicyView(reset, now);

      return {
        ok: true,
        policy: view,
      };
    },
  );
}
