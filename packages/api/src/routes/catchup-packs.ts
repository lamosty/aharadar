import { computeCreditsStatus } from "@aharadar/pipeline";
import { RUN_CATCHUP_PACK_JOB_NAME, type RunCatchupPackJobData } from "@aharadar/queues";
import {
  type BudgetTier,
  type CatchupPack,
  type CatchupPackOutput,
  computeCatchupPackHash,
} from "@aharadar/shared";
import type { FastifyInstance } from "fastify";
import { getDb, getSingletonContext } from "../lib/db.js";
import { getPipelineQueue } from "../lib/queue.js";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_REGEX.test(value);
}

interface CreateCatchupPackBody {
  topicId: string;
  timeframeDays: number;
  timeBudgetMinutes: number;
}

interface ListCatchupPacksQuery {
  topicId?: string;
  limit?: string;
  offset?: string;
}

function asBudgetTier(status: { warningLevel: string; paidCallsAllowed: boolean }): BudgetTier {
  if (!status.paidCallsAllowed) return "low";
  return status.warningLevel === "critical" ? "low" : "normal";
}

function formatPackRow(pack: CatchupPack) {
  return {
    id: pack.id,
    topicId: pack.topic_id,
    scopeType: pack.scope_type,
    scopeHash: pack.scope_hash,
    status: pack.status,
    summaryJson: pack.summary_json as CatchupPackOutput | null,
    promptId: pack.prompt_id,
    schemaVersion: pack.schema_version,
    provider: pack.provider,
    model: pack.model,
    inputItemCount: pack.input_item_count,
    inputCharCount: pack.input_char_count,
    inputTokens: pack.input_tokens,
    outputTokens: pack.output_tokens,
    costEstimateCredits: pack.cost_estimate_credits,
    metaJson: pack.meta_json,
    errorMessage: pack.error_message,
    createdAt: pack.created_at,
    updatedAt: pack.updated_at,
  };
}

export async function catchupPacksRoutes(fastify: FastifyInstance): Promise<void> {
  // POST /catchup-packs - generate or fetch a catch-up pack
  fastify.post<{ Body: CreateCatchupPackBody }>("/catchup-packs", async (request, reply) => {
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

    const body = request.body;
    if (!body || typeof body !== "object") {
      return reply.code(400).send({
        ok: false,
        error: { code: "INVALID_REQUEST", message: "Request body is required" },
      });
    }

    const { topicId, timeframeDays, timeBudgetMinutes } = body;
    if (!isValidUuid(topicId)) {
      return reply.code(400).send({
        ok: false,
        error: { code: "INVALID_PARAM", message: "topicId is required and must be a valid UUID" },
      });
    }

    const allowedTimeframes = new Set([3, 7, 14]);
    if (!Number.isFinite(timeframeDays) || !allowedTimeframes.has(timeframeDays)) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "INVALID_PARAM",
          message: "timeframeDays must be one of 3, 7, or 14",
        },
      });
    }

    const allowedBudgets = new Set([30, 45, 60, 90]);
    if (!Number.isFinite(timeBudgetMinutes) || !allowedBudgets.has(timeBudgetMinutes)) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "INVALID_PARAM",
          message: "timeBudgetMinutes must be one of 30, 45, 60, or 90",
        },
      });
    }

    const db = getDb();
    const topic = await db.topics.getById(topicId);
    if (!topic) {
      return reply.code(404).send({
        ok: false,
        error: { code: "NOT_FOUND", message: "Topic not found" },
      });
    }
    if (topic.user_id !== ctx.userId) {
      return reply.code(403).send({
        ok: false,
        error: { code: "FORBIDDEN", message: "Topic does not belong to current user" },
      });
    }

    const windowEnd = new Date();
    const windowStart = new Date(windowEnd.getTime() - timeframeDays * 24 * 60 * 60 * 1000);

    const monthlyCredits = Number.parseInt(process.env.MONTHLY_CREDITS ?? "10000", 10);
    const dailyThrottleCreditsStr = process.env.DAILY_THROTTLE_CREDITS;
    const dailyThrottleCredits = dailyThrottleCreditsStr
      ? Number.parseInt(dailyThrottleCreditsStr, 10)
      : undefined;

    const creditsStatus = await computeCreditsStatus({
      db,
      userId: ctx.userId,
      monthlyCredits,
      dailyThrottleCredits,
      windowEnd: windowEnd.toISOString(),
    });

    if (!creditsStatus.paidCallsAllowed) {
      return reply.code(402).send({
        ok: false,
        error: {
          code: "INSUFFICIENT_CREDITS",
          message: "Monthly or daily credit limit reached. Catch-up packs require credits.",
          budgets: {
            monthlyUsed: creditsStatus.monthlyUsed,
            monthlyLimit: creditsStatus.monthlyLimit,
            monthlyRemaining: creditsStatus.monthlyRemaining,
            dailyUsed: creditsStatus.dailyUsed,
            dailyLimit: creditsStatus.dailyLimit,
            dailyRemaining: creditsStatus.dailyRemaining,
          },
        },
      });
    }

    const tier = asBudgetTier(creditsStatus);

    const scopeHash = computeCatchupPackHash({
      type: "range",
      topicId,
      since: windowStart.toISOString(),
      until: windowEnd.toISOString(),
      timeBudgetMinutes,
    });

    const existing = await db.catchupPacks.getByScope({
      userId: ctx.userId,
      scopeHash,
    });

    if (existing && existing.status === "complete") {
      return { ok: true, pack: formatPackRow(existing) };
    }

    const pending =
      !existing || existing.status === "error" || existing.status === "skipped"
        ? await db.catchupPacks.upsert({
            userId: ctx.userId,
            topicId,
            scopeType: "range",
            scopeHash,
            status: "pending",
            metaJson: {
              scope: {
                since: windowStart.toISOString(),
                until: windowEnd.toISOString(),
                timeBudgetMinutes,
              },
              requestTier: tier,
            },
          })
        : existing;

    try {
      const queue = getPipelineQueue();
      const jobData: RunCatchupPackJobData = {
        userId: ctx.userId,
        topicId,
        scopeHash,
        since: windowStart.toISOString(),
        until: windowEnd.toISOString(),
        timeBudgetMinutes,
      };
      await queue.add(RUN_CATCHUP_PACK_JOB_NAME, jobData, {
        jobId: scopeHash,
        removeOnComplete: true,
        removeOnFail: true,
      });
    } catch (err) {
      fastify.log.warn(
        { err: err instanceof Error ? err.message : String(err), scopeHash },
        "Failed to enqueue catch-up pack job",
      );
    }

    return {
      ok: true,
      pack: formatPackRow(pending),
    };
  });

  // GET /catchup-packs/:id - get pack details + items
  fastify.get<{ Params: { id: string } }>("/catchup-packs/:id", async (request, reply) => {
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
        error: { code: "INVALID_PARAM", message: "Invalid pack id" },
      });
    }

    const db = getDb();
    const pack = await db.catchupPacks.getById(id);
    if (!pack) {
      return reply.code(404).send({
        ok: false,
        error: { code: "NOT_FOUND", message: "Catch-up pack not found" },
      });
    }
    if (pack.user_id !== ctx.userId) {
      return reply.code(403).send({
        ok: false,
        error: { code: "FORBIDDEN", message: "Catch-up pack does not belong to user" },
      });
    }

    const summary = pack.summary_json as CatchupPackOutput | null;
    const itemIds = summary
      ? [
          ...summary.tiers.must_read,
          ...summary.tiers.worth_scanning,
          ...summary.tiers.headlines,
        ].map((item) => item.item_id)
      : [];

    const items =
      itemIds.length > 0
        ? await db.query<{
            id: string;
            title: string | null;
            body_text: string | null;
            canonical_url: string | null;
            external_id: string | null;
            author: string | null;
            published_at: string | null;
            source_type: string;
            source_id: string;
            metadata_json: Record<string, unknown> | null;
            feedback_action: string | null;
            read_at: string | null;
          }>(
            `select
               ci.id::text as id,
               ci.title,
               ci.body_text,
               ci.canonical_url,
               ci.external_id,
               ci.author,
               ci.published_at::text as published_at,
               ci.source_type,
               ci.source_id::text as source_id,
               ci.metadata_json,
               fe.action as feedback_action,
               cir.read_at::text as read_at
             from content_items ci
             left join lateral (
               select action from feedback_events
               where user_id = $1 and content_item_id = ci.id
               order by created_at desc
               limit 1
             ) fe on true
             left join content_item_reads cir
               on cir.user_id = $1 and cir.content_item_id = ci.id
             where ci.user_id = $1 and ci.id = any($2::uuid[])`,
            [ctx.userId, itemIds],
          )
        : { rows: [] };

    const itemMap = new Map(
      items.rows.map((row) => [
        row.id,
        {
          id: row.id,
          title: row.title,
          bodyText: row.body_text,
          url: row.canonical_url,
          externalId: row.external_id,
          author: row.author,
          publishedAt: row.published_at,
          sourceType: row.source_type,
          sourceId: row.source_id,
          metadata: row.metadata_json,
          feedback: row.feedback_action,
          readAt: row.read_at,
        },
      ]),
    );

    return {
      ok: true,
      pack: formatPackRow(pack),
      items: itemIds.map((id) => itemMap.get(id)).filter(Boolean),
    };
  });

  // DELETE /catchup-packs/:id - delete a pack
  fastify.delete<{ Params: { id: string } }>("/catchup-packs/:id", async (request, reply) => {
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
        error: { code: "INVALID_PARAM", message: "Invalid pack id" },
      });
    }

    const db = getDb();
    const pack = await db.catchupPacks.getById(id);
    if (!pack) {
      return reply.code(404).send({
        ok: false,
        error: { code: "NOT_FOUND", message: "Catch-up pack not found" },
      });
    }
    if (pack.user_id !== ctx.userId) {
      return reply.code(403).send({
        ok: false,
        error: { code: "FORBIDDEN", message: "Catch-up pack does not belong to user" },
      });
    }

    const deleted = await db.catchupPacks.deleteById({ userId: ctx.userId, id });

    return { ok: true, deleted };
  });

  // GET /catchup-packs?topicId=... - list packs
  fastify.get<{ Querystring: ListCatchupPacksQuery }>("/catchup-packs", async (request, reply) => {
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

    const topicId = request.query?.topicId ?? ctx.topicId;
    if (!isValidUuid(topicId)) {
      return reply.code(400).send({
        ok: false,
        error: { code: "INVALID_PARAM", message: "topicId must be a valid UUID" },
      });
    }

    const limit = Math.min(200, Math.max(1, parseInt(request.query?.limit ?? "50", 10)));
    const offset = Math.max(0, parseInt(request.query?.offset ?? "0", 10));

    const db = getDb();
    const packs = await db.catchupPacks.listByTopic({
      userId: ctx.userId,
      topicId,
      limit,
      offset,
    });

    return {
      ok: true,
      packs: packs.map(formatPackRow),
      pagination: {
        limit,
        offset,
        total: packs.length,
        hasMore: packs.length === limit,
      },
    };
  });
}
