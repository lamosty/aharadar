import type { FastifyInstance } from "fastify";
import type { FeedbackAction } from "@aharadar/shared";
import { createUserPreferencesRepo } from "@aharadar/db";
import { getDb, getSingletonContext } from "../lib/db.js";

/**
 * Apply exponential decay to a score based on item age.
 * @param score - Original score
 * @param itemAgeHours - Hours since item was published
 * @param decayHours - Half-life in hours (score halves after this time)
 * @returns Decayed score
 */
function applyDecay(score: number, itemAgeHours: number, decayHours: number): number {
  if (itemAgeHours <= 0 || decayHours <= 0) return score;
  // Exponential decay: score * e^(-age/decay)
  // This gives ~37% of original after decayHours
  const decayFactor = Math.exp(-itemAgeHours / decayHours);
  return score * decayFactor;
}

interface ContentItemRow {
  id: string;
  user_id: string;
  source_type: string;
  title: string | null;
  canonical_url: string | null;
  external_id: string | null;
  author: string | null;
  published_at: string | null;
  fetched_at: string;
  language: string | null;
  metadata_json: Record<string, unknown>;
}

interface UnifiedItemRow {
  content_item_id: string;
  score: number;
  digest_id: string;
  digest_created_at: string;
  triage_json: Record<string, unknown> | null;
  summary_json: Record<string, unknown> | null;
  entities_json: Record<string, unknown> | null;
  title: string | null;
  canonical_url: string | null;
  author: string | null;
  published_at: string | null;
  source_type: string;
  source_id: string;
  feedback_action: FeedbackAction | null;
}

interface ItemsListQuerystring {
  limit?: string;
  offset?: string;
  sourceTypes?: string;
  sourceIds?: string;
  minScore?: string;
  since?: string;
  until?: string;
  sort?: string;
}

function isValidIsoDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const d = new Date(value);
  return !isNaN(d.getTime());
}

function parseArrayParam(value: string | undefined): string[] {
  if (!value) return [];
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}

export async function itemsRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /items - Unified feed of all items across digests
  fastify.get<{ Querystring: ItemsListQuerystring }>("/items", async (request, reply) => {
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

    const {
      limit: limitStr,
      offset: offsetStr,
      sourceTypes: sourceTypesStr,
      sourceIds: sourceIdsStr,
      minScore: minScoreStr,
      since,
      until,
      sort = "score_desc",
    } = request.query;

    // Parse and validate limit
    const limit = Math.min(200, Math.max(1, parseInt(limitStr ?? "50", 10) || 50));
    const offset = Math.max(0, parseInt(offsetStr ?? "0", 10) || 0);

    // Parse filters
    const sourceTypes = parseArrayParam(sourceTypesStr);
    const sourceIds = parseArrayParam(sourceIdsStr);
    const minScore = minScoreStr !== undefined ? parseFloat(minScoreStr) : undefined;

    // Validate dates
    if (since !== undefined && !isValidIsoDate(since)) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "INVALID_PARAM",
          message: "Invalid 'since' parameter: must be ISO date string",
        },
      });
    }
    if (until !== undefined && !isValidIsoDate(until)) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "INVALID_PARAM",
          message: "Invalid 'until' parameter: must be ISO date string",
        },
      });
    }

    // Validate sort
    const validSorts = ["score_desc", "date_desc", "date_asc"];
    if (!validSorts.includes(sort)) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "INVALID_PARAM",
          message: `Invalid 'sort' parameter: must be one of ${validSorts.join(", ")}`,
        },
      });
    }

    const db = getDb();

    // Load user preferences for decay calculation
    const prefsRepo = createUserPreferencesRepo(db);
    const userPrefs = await prefsRepo.getOrCreate(ctx.userId);
    const decayHours = userPrefs.decayHours;
    const lastCheckedAt = userPrefs.lastCheckedAt;

    // Build filter conditions dynamically
    const filterConditions: string[] = [];
    const filterParams: unknown[] = [];
    let filterParamIdx = 1;

    if (sourceTypes.length > 0) {
      filterConditions.push(`ci.source_type = ANY($${filterParamIdx}::text[])`);
      filterParams.push(sourceTypes);
      filterParamIdx++;
    }

    if (sourceIds.length > 0) {
      filterConditions.push(`ci.source_id = ANY($${filterParamIdx}::uuid[])`);
      filterParams.push(sourceIds);
      filterParamIdx++;
    }

    if (minScore !== undefined && !isNaN(minScore)) {
      filterConditions.push(`li.score >= $${filterParamIdx}`);
      filterParams.push(minScore);
      filterParamIdx++;
    }

    if (since) {
      filterConditions.push(`ci.published_at >= $${filterParamIdx}::timestamptz`);
      filterParams.push(since);
      filterParamIdx++;
    }

    if (until) {
      filterConditions.push(`ci.published_at <= $${filterParamIdx}::timestamptz`);
      filterParams.push(until);
      filterParamIdx++;
    }

    const filterClause = filterConditions.length > 0 ? filterConditions.join(" AND ") : "true";

    // Determine ORDER BY
    let orderBy: string;
    switch (sort) {
      case "date_desc":
        orderBy = "ci.published_at DESC NULLS LAST";
        break;
      case "date_asc":
        orderBy = "ci.published_at ASC NULLS LAST";
        break;
      default:
        orderBy = "li.score DESC";
    }

    // Query: Get latest score for each content item
    // Uses DISTINCT ON to get the most recent digest entry for each item
    const itemsQuery = `
      WITH latest_items AS (
        SELECT DISTINCT ON (di.content_item_id)
          di.content_item_id,
          di.score,
          di.digest_id,
          di.triage_json,
          di.summary_json,
          di.entities_json,
          d.created_at as digest_created_at
        FROM digest_items di
        JOIN digests d ON d.id = di.digest_id
        JOIN content_items ci_inner ON ci_inner.id = di.content_item_id
        WHERE di.content_item_id IS NOT NULL
          AND d.user_id = '${ctx.userId}'
          AND d.topic_id = '${ctx.topicId}'::uuid
        ORDER BY di.content_item_id, d.created_at DESC
      )
      SELECT
        li.content_item_id,
        li.score,
        li.digest_id::text,
        li.digest_created_at::text,
        li.triage_json,
        li.summary_json,
        li.entities_json,
        ci.title,
        ci.canonical_url,
        ci.author,
        ci.published_at::text,
        ci.source_type,
        ci.source_id::text,
        fe.action as feedback_action
      FROM latest_items li
      JOIN content_items ci ON ci.id = li.content_item_id
      LEFT JOIN LATERAL (
        SELECT action FROM feedback_events
        WHERE user_id = '${ctx.userId}' AND content_item_id = li.content_item_id
        ORDER BY created_at DESC
        LIMIT 1
      ) fe ON true
      WHERE ${filterClause}
      ORDER BY ${orderBy}
      LIMIT $${filterParamIdx}
      OFFSET $${filterParamIdx + 1}
    `;

    const itemsParams = [...filterParams, limit, offset];

    // Count query for pagination
    const countQuery = `
      WITH latest_items AS (
        SELECT DISTINCT ON (di.content_item_id)
          di.content_item_id,
          di.score
        FROM digest_items di
        JOIN digests d ON d.id = di.digest_id
        WHERE di.content_item_id IS NOT NULL
          AND d.user_id = '${ctx.userId}'
          AND d.topic_id = '${ctx.topicId}'::uuid
        ORDER BY di.content_item_id, d.created_at DESC
      )
      SELECT COUNT(*)::int as total
      FROM latest_items li
      JOIN content_items ci ON ci.id = li.content_item_id
      WHERE ${filterClause}
    `;

    const [itemsResult, countResult] = await Promise.all([
      db.query<UnifiedItemRow>(itemsQuery, itemsParams),
      db.query<{ total: number }>(countQuery, filterParams),
    ]);

    const total = countResult.rows[0]?.total ?? 0;
    const now = new Date();

    // Map items with decay applied and isNew flag
    const items = itemsResult.rows.map((row, idx) => {
      // Calculate item age in hours (use published_at or digest_created_at)
      const itemDate = row.published_at ? new Date(row.published_at) : new Date(row.digest_created_at);
      const itemAgeHours = (now.getTime() - itemDate.getTime()) / (1000 * 60 * 60);

      // Apply decay to score
      const rawScore = row.score;
      const decayedScore = applyDecay(rawScore, itemAgeHours, decayHours);

      // Check if item is "new" (published after last checked)
      const isNew = lastCheckedAt ? itemDate > lastCheckedAt : false;

      return {
        id: row.content_item_id,
        score: decayedScore,
        rawScore, // Original score before decay
        rank: offset + idx + 1,
        digestId: row.digest_id,
        digestCreatedAt: row.digest_created_at,
        isNew,
        item: {
          title: row.title,
          url: row.canonical_url,
          author: row.author,
          publishedAt: row.published_at,
          sourceType: row.source_type,
          sourceId: row.source_id,
        },
        triageJson: row.triage_json,
        feedback: row.feedback_action,
      };
    });

    // Re-sort by decayed score if sorting by score
    if (sort === "score_desc") {
      items.sort((a, b) => b.score - a.score);
      // Update ranks after re-sort
      items.forEach((item, idx) => {
        item.rank = offset + idx + 1;
      });
    }

    return {
      ok: true,
      items,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + itemsResult.rows.length < total,
      },
      preferences: {
        decayHours,
        lastCheckedAt: lastCheckedAt?.toISOString() ?? null,
      },
    };
  });

  // GET /items/:id - Single item detail
  fastify.get<{ Params: { id: string } }>("/items/:id", async (request, reply) => {
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
    const db = getDb();

    const result = await db.query<ContentItemRow>(
      `SELECT
         id,
         user_id,
         source_type,
         title,
         canonical_url,
         external_id,
         author,
         published_at::text,
         fetched_at::text,
         language,
         metadata_json
       FROM content_items
       WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );

    const item = result.rows[0];
    if (!item) {
      return reply.code(404).send({
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: "Content item not found",
        },
      });
    }

    if (item.user_id !== ctx.userId) {
      return reply.code(403).send({
        ok: false,
        error: {
          code: "FORBIDDEN",
          message: "Content item does not belong to current user",
        },
      });
    }

    return {
      ok: true,
      item: {
        id: item.id,
        sourceType: item.source_type,
        title: item.title,
        url: item.canonical_url,
        externalId: item.external_id,
        author: item.author,
        publishedAt: item.published_at,
        fetchedAt: item.fetched_at,
        language: item.language,
        metadata: item.metadata_json,
      },
    };
  });
}
