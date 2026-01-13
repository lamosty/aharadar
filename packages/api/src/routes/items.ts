import type { FeedbackAction } from "@aharadar/shared";
import type { FastifyInstance } from "fastify";
import { getDb, getSingletonContext } from "../lib/db.js";

// Note: Decay is now computed in SQL for correct pagination ordering
// Formula: score * EXP(-age_hours / decay_hours)
// This gives ~37% of original score after decayHours

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

interface ClusterItemRow {
  id: string;
  title: string | null;
  url: string | null;
  source_type: string;
  author: string | null;
  similarity: number;
}

interface UnifiedItemRow {
  content_item_id: string;
  aha_score: number;
  trending_score: number;
  digest_id: string;
  digest_created_at: string;
  triage_json: Record<string, unknown> | null;
  summary_json: Record<string, unknown> | null;
  entities_json: Record<string, unknown> | null;
  title: string | null;
  body_text: string | null;
  canonical_url: string | null;
  external_id: string | null;
  author: string | null;
  published_at: string | null;
  source_type: string;
  source_id: string;
  metadata_json: Record<string, unknown> | null;
  feedback_action: FeedbackAction | null;
  // Cluster fields
  cluster_id: string | null;
  cluster_member_count: number | null;
  cluster_items_json: ClusterItemRow[] | null;
  // Topic fields (for "all topics" mode)
  topic_id: string;
  topic_name: string;
  // Deep review preview summary (only when status='preview')
  preview_summary_json: Record<string, unknown> | null;
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
  topicId?: string;
  // Views: inbox (no feedback), highlights (liked), all (no filter), deep_dive (liked + not promoted/dropped)
  view?: "inbox" | "highlights" | "all" | "deep_dive";
}

function isValidIsoDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const d = new Date(value);
  return !Number.isNaN(d.getTime());
}

function parseArrayParam(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
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
      sort = "best",
      topicId: topicIdParam,
      view = "all",
    } = request.query;

    // Determine topic scope:
    // - "all" = aggregate across all user's topics
    // - UUID = specific topic (validated)
    // - missing = default topic
    const isAllTopics = topicIdParam === "all";
    let effectiveTopicId: string | null = isAllTopics ? null : ctx.topicId;

    if (topicIdParam && !isAllTopics) {
      // Validate topic belongs to user
      const db = getDb();
      const topic = await db.topics.getById(topicIdParam);
      if (!topic) {
        return reply.code(404).send({
          ok: false,
          error: {
            code: "NOT_FOUND",
            message: `Topic not found: ${topicIdParam}`,
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
      effectiveTopicId = topicIdParam;
    }

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
    // "best" = raw score (no decay), "latest" = by publication date, "trending" = decayed score, "ai_score" = raw LLM triage score
    const validSorts = ["best", "latest", "trending", "ai_score"];
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

    // Get decay settings from topic (or defaults for "all topics" mode)
    // For single topic: use topic.decay_hours and topic.last_checked_at
    // For all topics: use default 24h decay, no lastCheckedAt (can't have single "caught up" state)
    let decayHours = 24; // Default
    let lastCheckedAt: Date | null = null;

    if (effectiveTopicId) {
      const topic = await db.topics.getById(effectiveTopicId);
      if (topic) {
        decayHours = topic.decay_hours ?? 24;
        lastCheckedAt = topic.last_checked_at ? new Date(topic.last_checked_at) : null;
      }
    }

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

    if (minScore !== undefined && !Number.isNaN(minScore)) {
      filterConditions.push(`li.aha_score >= $${filterParamIdx}`);
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

    // View filter: inbox (no feedback), highlights (feedback = 'like'), all (no filter), deep_dive (liked + not promoted/dropped)
    // Note: fe.action is from the LATERAL subquery, dr is from LEFT JOIN content_item_deep_reviews
    if (view === "inbox") {
      filterConditions.push("fe.action IS NULL");
    } else if (view === "highlights") {
      filterConditions.push("fe.action = 'like'");
    } else if (view === "deep_dive") {
      // Deep Dive queue: liked items that haven't been promoted or dropped yet
      filterConditions.push("fe.action = 'like'");
      filterConditions.push("(dr.status IS NULL OR dr.status = 'preview')");
    }
    // view === 'all' -> no filter

    const filterClause = filterConditions.length > 0 ? filterConditions.join(" AND ") : "true";

    // Determine ORDER BY
    // - "best": raw score (no decay) - default, shows highest quality items first
    // - "latest": by publication date - shows newest items first
    // - "trending": decayed score - balances quality with recency
    // - "ai_score": raw LLM triage score - useful for debugging ranking issues
    // Note: All modes include li.content_item_id as tie-breaker for deterministic pagination
    let orderBy: string;
    switch (sort) {
      case "latest":
        orderBy = "ci.published_at DESC NULLS LAST, li.content_item_id DESC";
        break;
      case "trending":
        // Order by decayed score (computed in SELECT)
        orderBy = "trending_score DESC, li.content_item_id DESC";
        break;
      case "ai_score":
        // Order by raw LLM triage score (ai_score from triage_json)
        orderBy = "(li.triage_json->>'ai_score')::numeric DESC NULLS LAST, li.content_item_id DESC";
        break;
      default: // "best"
        // Order by raw score (no decay) - best quality items first
        orderBy = "li.aha_score DESC, li.content_item_id DESC";
    }

    // Query: Get latest score for each content item
    // Uses DISTINCT ON to get the most recent digest entry for each item
    // Supports both individual items (di.content_item_id) and cluster representatives (c.representative_content_item_id)
    // Decay is computed in SQL: score * EXP(-age_hours / decay_hours)
    const decayHoursParamIdx = filterParamIdx;
    filterParamIdx++;

    // Build topic filter clause (empty for "all topics" mode)
    const topicFilterClause = effectiveTopicId
      ? `AND d.topic_id = '${effectiveTopicId}'::uuid`
      : "";

    const itemsQuery = `
      WITH latest_items AS (
        SELECT DISTINCT ON (COALESCE(di.content_item_id, c.representative_content_item_id))
          COALESCE(di.content_item_id, c.representative_content_item_id) as content_item_id,
          di.cluster_id,
          di.aha_score,
          di.digest_id,
          di.triage_json,
          di.summary_json,
          di.entities_json,
          d.created_at as digest_created_at,
          d.topic_id as digest_topic_id
        FROM digest_items di
        JOIN digests d ON d.id = di.digest_id
        LEFT JOIN clusters c ON c.id = di.cluster_id
        JOIN content_items ci_inner ON ci_inner.id = COALESCE(di.content_item_id, c.representative_content_item_id)
        WHERE (di.content_item_id IS NOT NULL OR c.representative_content_item_id IS NOT NULL)
          AND d.user_id = '${ctx.userId}'
          ${topicFilterClause}
        ORDER BY COALESCE(di.content_item_id, c.representative_content_item_id), d.created_at DESC
      )
      SELECT
        li.content_item_id,
        li.cluster_id::text,
        li.aha_score,
        -- Compute decay-adjusted score in SQL for correct ordering
        -- Formula: aha_score * EXP(-age_hours / decay_hours)
        -- Age uses published_at if available, otherwise digest_created_at
        (li.aha_score * EXP(
          -GREATEST(0, EXTRACT(EPOCH FROM (NOW() - COALESCE(ci.published_at, li.digest_created_at))) / 3600.0)
          / GREATEST(1, $${decayHoursParamIdx}::float)
        ))::real as trending_score,
        li.digest_id::text,
        li.digest_created_at::text,
        li.triage_json,
        li.summary_json,
        li.entities_json,
        ci.title,
        ci.body_text,
        ci.canonical_url,
        ci.external_id,
        ci.author,
        ci.published_at::text,
        ci.source_type,
        ci.source_id::text,
        ci.metadata_json,
        fe.action as feedback_action,
        -- Cluster member count (excluding representative)
        cluster_count.member_count as cluster_member_count,
        -- Cluster items (excluding representative, ordered by similarity)
        cluster_members.items_json as cluster_items_json,
        -- Topic fields
        li.digest_topic_id::text as topic_id,
        t.name as topic_name,
        -- Deep review preview summary (only when status='preview')
        CASE WHEN dr.status = 'preview' THEN dr.summary_json ELSE NULL END as preview_summary_json
      FROM latest_items li
      JOIN content_items ci ON ci.id = li.content_item_id
      JOIN topics t ON t.id = li.digest_topic_id
      LEFT JOIN LATERAL (
        SELECT action FROM feedback_events
        WHERE user_id = '${ctx.userId}' AND content_item_id = li.content_item_id
        ORDER BY created_at DESC
        LIMIT 1
      ) fe ON true
      LEFT JOIN content_item_deep_reviews dr
        ON dr.user_id = '${ctx.userId}' AND dr.content_item_id = li.content_item_id
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int as member_count
        FROM cluster_items cli
        WHERE cli.cluster_id = li.cluster_id
      ) cluster_count ON li.cluster_id IS NOT NULL
      LEFT JOIN LATERAL (
        SELECT COALESCE(
          json_agg(
            json_build_object(
              'id', ci_member.id,
              'title', ci_member.title,
              'url', ci_member.canonical_url,
              'source_type', ci_member.source_type,
              'author', ci_member.author,
              'similarity', ROUND(cli.similarity::numeric, 2)
            ) ORDER BY cli.similarity DESC NULLS LAST
          ) FILTER (WHERE ci_member.id IS NOT NULL AND ci_member.id != li.content_item_id),
          '[]'::json
        ) as items_json
        FROM cluster_items cli
        JOIN content_items ci_member ON ci_member.id = cli.content_item_id
        WHERE cli.cluster_id = li.cluster_id
          AND ci_member.deleted_at IS NULL
      ) cluster_members ON li.cluster_id IS NOT NULL
      WHERE ${filterClause}
      ORDER BY ${orderBy}
      LIMIT $${filterParamIdx}
      OFFSET $${filterParamIdx + 1}
    `;

    const itemsParams = [...filterParams, decayHours, limit, offset];

    // Count query for pagination (same logic as items query)
    const countQuery = `
      WITH latest_items AS (
        SELECT DISTINCT ON (COALESCE(di.content_item_id, c.representative_content_item_id))
          COALESCE(di.content_item_id, c.representative_content_item_id) as content_item_id,
          di.aha_score
        FROM digest_items di
        JOIN digests d ON d.id = di.digest_id
        LEFT JOIN clusters c ON c.id = di.cluster_id
        WHERE (di.content_item_id IS NOT NULL OR c.representative_content_item_id IS NOT NULL)
          AND d.user_id = '${ctx.userId}'
          ${topicFilterClause}
        ORDER BY COALESCE(di.content_item_id, c.representative_content_item_id), d.created_at DESC
      )
      SELECT COUNT(*)::int as total
      FROM latest_items li
      JOIN content_items ci ON ci.id = li.content_item_id
      LEFT JOIN LATERAL (
        SELECT action FROM feedback_events
        WHERE user_id = '${ctx.userId}' AND content_item_id = li.content_item_id
        ORDER BY created_at DESC
        LIMIT 1
      ) fe ON true
      LEFT JOIN content_item_deep_reviews dr
        ON dr.user_id = '${ctx.userId}' AND dr.content_item_id = li.content_item_id
      WHERE ${filterClause}
    `;

    const [itemsResult, countResult] = await Promise.all([
      db.query<UnifiedItemRow>(itemsQuery, itemsParams),
      db.query<{ total: number }>(countQuery, filterParams),
    ]);

    const total = countResult.rows[0]?.total ?? 0;

    // Map items - decay is already computed in SQL, no re-sorting needed
    const items = itemsResult.rows.map((row, idx) => {
      // Check if item is "new" (published after last checked)
      const itemDate = row.published_at
        ? new Date(row.published_at)
        : new Date(row.digest_created_at);
      const isNew = lastCheckedAt ? itemDate > lastCheckedAt : false;

      // Parse cluster items JSON
      const clusterItems = row.cluster_items_json
        ? (
            row.cluster_items_json as Array<{
              id: string;
              title: string | null;
              url: string | null;
              source_type: string;
              author: string | null;
              similarity: number;
            }>
          ).map((item) => ({
            id: item.id,
            title: item.title,
            url: item.url,
            sourceType: item.source_type,
            author: item.author,
            similarity: item.similarity,
          }))
        : undefined;

      return {
        id: row.content_item_id,
        score: row.trending_score, // Decay computed in SQL (for backwards compat)
        ahaScore: row.aha_score, // Raw personalized score
        trendingScore: row.trending_score, // Decayed score
        rank: offset + idx + 1,
        digestId: row.digest_id,
        digestCreatedAt: row.digest_created_at,
        isNew,
        item: {
          title: row.title,
          bodyText: row.body_text,
          url: row.canonical_url,
          externalId: row.external_id,
          author: row.author,
          publishedAt: row.published_at,
          sourceType: row.source_type,
          sourceId: row.source_id,
          metadata: row.metadata_json,
        },
        triageJson: row.triage_json,
        feedback: row.feedback_action,
        // Cluster data
        clusterId: row.cluster_id,
        clusterMemberCount: row.cluster_member_count ?? undefined,
        clusterItems: clusterItems?.length ? clusterItems : undefined,
        // Topic context (for "all topics" mode)
        topicId: row.topic_id,
        topicName: row.topic_name,
        // Deep review preview summary (only present when status='preview')
        previewSummaryJson: row.preview_summary_json ?? undefined,
      };
    });

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
      [id],
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
