import type { FastifyInstance } from "fastify";
import { getDb, getSingletonContext } from "../lib/db.js";

interface DigestListRow {
  id: string;
  topic_id: string;
  topic_name: string;
  mode: string;
  status: string;
  credits_used: string; // numeric comes as string from pg
  window_start: string;
  window_end: string;
  created_at: string;
  item_count: string; // bigint comes as string from pg
  top_score: string | null; // real comes as string from pg
  source_results: unknown; // JSONB
}

interface DigestDetailRow {
  id: string;
  user_id: string;
  topic_id: string;
  mode: string;
  status: string;
  credits_used: string; // numeric comes as string from pg
  source_results: unknown; // JSONB
  error_message: string | null;
  window_start: string;
  window_end: string;
  created_at: string;
}

interface SourceResult {
  sourceId: string;
  sourceName: string;
  sourceType: string;
  status: string;
  skipReason?: string;
  itemsFetched: number;
}

interface DigestItemRow {
  rank: number;
  score: number;
  content_item_id: string | null;
  cluster_id: string | null;
  effective_content_item_id: string | null;
  triage_json: Record<string, unknown> | null;
  summary_json: Record<string, unknown> | null;
  entities_json: Record<string, unknown> | null;
  item_title: string | null;
  item_url: string | null;
  item_author: string | null;
  item_published_at: string | null;
  item_source_type: string | null;
  item_body_text: string | null;
  item_metadata_json: Record<string, unknown> | null;
  item_external_id: string | null;
}

function isValidIsoDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const d = new Date(value);
  return !Number.isNaN(d.getTime());
}

function isValidUuid(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

export async function digestsRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /digests - List digests with optional topic filter
  fastify.get<{ Querystring: { from?: string; to?: string; topic?: string } }>(
    "/digests",
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

      const { from, to, topic } = request.query;

      if (from !== undefined && !isValidIsoDate(from)) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: "INVALID_PARAM",
            message: "Invalid 'from' parameter: must be ISO date string",
          },
        });
      }

      if (to !== undefined && !isValidIsoDate(to)) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: "INVALID_PARAM",
            message: "Invalid 'to' parameter: must be ISO date string",
          },
        });
      }

      if (topic !== undefined && !isValidUuid(topic)) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: "INVALID_PARAM",
            message: "Invalid 'topic' parameter: must be UUID",
          },
        });
      }

      const db = getDb();
      const now = new Date();
      const defaultFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const defaultTo = now.toISOString();

      const fromDate = from ?? defaultFrom;
      const toDate = to ?? defaultTo;

      // If topic is provided, filter to that topic; otherwise return all topics for user
      const topicFilter = topic ? "AND d.topic_id = $4::uuid" : "";
      const params = topic ? [ctx.userId, fromDate, toDate, topic] : [ctx.userId, fromDate, toDate];

      const result = await db.query<DigestListRow>(
        `SELECT
         d.id,
         d.topic_id::text,
         t.name as topic_name,
         d.mode,
         d.status,
         d.credits_used,
         d.source_results,
         d.window_start::text,
         d.window_end::text,
         d.created_at::text,
         (SELECT COUNT(*) FROM digest_items di WHERE di.digest_id = d.id) as item_count,
         (SELECT MAX(di.score) FROM digest_items di WHERE di.digest_id = d.id) as top_score
       FROM digests d
       JOIN topics t ON t.id = d.topic_id
       WHERE d.user_id = $1
         AND d.created_at >= $2::timestamptz AND d.created_at <= $3::timestamptz
         ${topicFilter}
       ORDER BY d.created_at DESC
       LIMIT 100`,
        params,
      );

      return {
        ok: true,
        digests: result.rows.map((row) => {
          const sourceResults = (
            typeof row.source_results === "string"
              ? JSON.parse(row.source_results)
              : (row.source_results ?? [])
          ) as SourceResult[];
          const succeededCount = sourceResults.filter(
            (s) => s.status === "ok" || s.status === "partial",
          ).length;
          const skippedCount = sourceResults.filter((s) => s.status === "skipped").length;

          return {
            id: row.id,
            topicId: row.topic_id,
            topicName: row.topic_name,
            mode: row.mode,
            status: row.status,
            creditsUsed: parseFloat(row.credits_used) || 0,
            topScore: row.top_score ? parseFloat(row.top_score) : null,
            windowStart: row.window_start,
            windowEnd: row.window_end,
            createdAt: row.created_at,
            itemCount: Number.parseInt(row.item_count, 10),
            sourceCount: {
              total: sourceResults.length,
              succeeded: succeededCount,
              skipped: skippedCount,
            },
          };
        }),
      };
    },
  );

  // GET /digests/:id - Get digest detail
  fastify.get<{ Params: { id: string } }>("/digests/:id", async (request, reply) => {
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

    const digestResult = await db.query<DigestDetailRow>(
      `SELECT id, user_id, topic_id::text, mode, status, credits_used, source_results, error_message,
              window_start::text, window_end::text, created_at::text
       FROM digests
       WHERE id = $1`,
      [id],
    );

    const digest = digestResult.rows[0];
    if (!digest) {
      return reply.code(404).send({
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: "Digest not found",
        },
      });
    }

    // Only check user ownership, allow viewing any topic's digest
    if (digest.user_id !== ctx.userId) {
      return reply.code(403).send({
        ok: false,
        error: {
          code: "FORBIDDEN",
          message: "Digest does not belong to current user",
        },
      });
    }

    // Query digest items, joining both direct content items and cluster representatives
    // Uses COALESCE to prefer direct content item, falling back to cluster representative
    // effective_content_item_id provides a real ID for feedback/navigation even for cluster rows
    const itemsResult = await db.query<DigestItemRow>(
      `SELECT
         di.rank,
         di.score,
         di.content_item_id,
         di.cluster_id,
         COALESCE(di.content_item_id, cl.representative_content_item_id)::text as effective_content_item_id,
         di.triage_json,
         di.summary_json,
         di.entities_json,
         COALESCE(ci.title, ci_rep.title) as item_title,
         COALESCE(ci.canonical_url, ci_rep.canonical_url) as item_url,
         COALESCE(ci.author, ci_rep.author) as item_author,
         COALESCE(ci.published_at, ci_rep.published_at)::text as item_published_at,
         COALESCE(ci.source_type, ci_rep.source_type) as item_source_type,
         COALESCE(ci.body_text, ci_rep.body_text) as item_body_text,
         COALESCE(ci.metadata_json, ci_rep.metadata_json) as item_metadata_json,
         COALESCE(ci.external_id, ci_rep.external_id) as item_external_id
       FROM digest_items di
       LEFT JOIN content_items ci ON ci.id = di.content_item_id
       LEFT JOIN clusters cl ON cl.id = di.cluster_id
       LEFT JOIN content_items ci_rep ON ci_rep.id = cl.representative_content_item_id
       WHERE di.digest_id = $1
       ORDER BY di.rank ASC`,
      [id],
    );

    const sourceResults = (
      typeof digest.source_results === "string"
        ? JSON.parse(digest.source_results)
        : (digest.source_results ?? [])
    ) as SourceResult[];

    return {
      ok: true,
      digest: {
        id: digest.id,
        mode: digest.mode,
        status: digest.status,
        creditsUsed: parseFloat(digest.credits_used) || 0,
        sourceResults,
        errorMessage: digest.error_message,
        windowStart: digest.window_start,
        windowEnd: digest.window_end,
        createdAt: digest.created_at,
      },
      items: itemsResult.rows.map((row) => ({
        rank: row.rank,
        score: row.score,
        // Use effective_content_item_id for feedback/navigation (includes cluster representative)
        contentItemId: row.effective_content_item_id,
        clusterId: row.cluster_id,
        triageJson: row.triage_json,
        summaryJson: row.summary_json,
        entitiesJson: row.entities_json,
        // Return item if we have any content (direct item or cluster representative)
        item:
          row.item_title || row.item_url || row.item_source_type || row.item_body_text
            ? {
                title: row.item_title,
                url: row.item_url,
                author: row.item_author,
                publishedAt: row.item_published_at,
                sourceType: row.item_source_type,
                bodyText: row.item_body_text,
                metadata: row.item_metadata_json,
                externalId: row.item_external_id,
              }
            : null,
      })),
    };
  });

  // GET /digests/stats - Aggregated analytics for digests
  fastify.get<{ Querystring: { from: string; to: string; topic?: string } }>(
    "/digests/stats",
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

      const { from, to, topic } = request.query;

      if (!isValidIsoDate(from)) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: "INVALID_PARAM",
            message: "Invalid 'from' parameter: must be ISO date string",
          },
        });
      }

      if (!isValidIsoDate(to)) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: "INVALID_PARAM",
            message: "Invalid 'to' parameter: must be ISO date string",
          },
        });
      }

      if (topic !== undefined && !isValidUuid(topic)) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: "INVALID_PARAM",
            message: "Invalid 'topic' parameter: must be UUID",
          },
        });
      }

      const db = getDb();

      // Calculate previous period (same duration, immediately before 'from')
      const fromDate = new Date(from);
      const toDate = new Date(to);
      const periodMs = toDate.getTime() - fromDate.getTime();
      const prevFrom = new Date(fromDate.getTime() - periodMs).toISOString();
      const prevTo = from;

      const topicFilter = topic ? "AND d.topic_id = $4::uuid" : "";
      const baseParams = topic ? [ctx.userId, from, to, topic] : [ctx.userId, from, to];
      const prevParams = topic
        ? [ctx.userId, prevFrom, prevTo, topic]
        : [ctx.userId, prevFrom, prevTo];

      // Main stats query
      interface StatsRow {
        digest_count: string;
        total_items: string;
        avg_items_per_digest: string;
        avg_top_score: string;
        total_credits: string;
        avg_credits_per_digest: string;
        credits_low: string;
        credits_normal: string;
        credits_high: string;
      }

      const statsQuery = `
        WITH digest_stats AS (
          SELECT
            d.id,
            d.mode,
            d.credits_used,
            (SELECT COUNT(*) FROM digest_items di WHERE di.digest_id = d.id) as item_count,
            (SELECT MAX(di.score) FROM digest_items di WHERE di.digest_id = d.id) as top_score
          FROM digests d
          WHERE d.user_id = $1
            AND d.created_at >= $2::timestamptz AND d.created_at <= $3::timestamptz
            ${topicFilter}
        )
        SELECT
          COUNT(*)::text as digest_count,
          COALESCE(SUM(item_count), 0)::text as total_items,
          COALESCE(AVG(item_count), 0)::text as avg_items_per_digest,
          COALESCE(AVG(top_score), 0)::text as avg_top_score,
          COALESCE(SUM(credits_used), 0)::text as total_credits,
          COALESCE(AVG(credits_used), 0)::text as avg_credits_per_digest,
          COALESCE(SUM(CASE WHEN mode = 'low' THEN credits_used ELSE 0 END), 0)::text as credits_low,
          COALESCE(SUM(CASE WHEN mode = 'normal' THEN credits_used ELSE 0 END), 0)::text as credits_normal,
          COALESCE(SUM(CASE WHEN mode = 'high' THEN credits_used ELSE 0 END), 0)::text as credits_high
        FROM digest_stats
      `;

      // Triage breakdown query
      interface TriageRow {
        triage_high: string;
        triage_medium: string;
        triage_low: string;
        triage_skip: string;
        total_triaged: string;
      }

      const triageQuery = `
        SELECT
          COUNT(*) FILTER (WHERE (di.triage_json->>'interest')::int >= 7)::text as triage_high,
          COUNT(*) FILTER (WHERE (di.triage_json->>'interest')::int >= 4 AND (di.triage_json->>'interest')::int < 7)::text as triage_medium,
          COUNT(*) FILTER (WHERE (di.triage_json->>'interest')::int >= 1 AND (di.triage_json->>'interest')::int < 4)::text as triage_low,
          COUNT(*) FILTER (WHERE (di.triage_json->>'interest')::int = 0 OR di.triage_json IS NULL)::text as triage_skip,
          COUNT(*)::text as total_triaged
        FROM digest_items di
        JOIN digests d ON d.id = di.digest_id
        WHERE d.user_id = $1
          AND d.created_at >= $2::timestamptz AND d.created_at <= $3::timestamptz
          ${topicFilter}
      `;

      const [statsResult, triageResult, prevStatsResult] = await Promise.all([
        db.query<StatsRow>(statsQuery, baseParams),
        db.query<TriageRow>(triageQuery, baseParams),
        db.query<StatsRow>(statsQuery, prevParams),
      ]);

      const stats = statsResult.rows[0];
      const triage = triageResult.rows[0];
      const prevStats = prevStatsResult.rows[0];

      const totalTriaged = parseInt(triage.total_triaged, 10) || 1; // Avoid division by zero

      return {
        ok: true,
        stats: {
          totalItems: parseInt(stats.total_items, 10),
          digestCount: parseInt(stats.digest_count, 10),
          avgItemsPerDigest: parseFloat(stats.avg_items_per_digest) || 0,
          avgTopScore: parseFloat(stats.avg_top_score) || 0,
          triageBreakdown: {
            high: (parseInt(triage.triage_high, 10) / totalTriaged) * 100,
            medium: (parseInt(triage.triage_medium, 10) / totalTriaged) * 100,
            low: (parseInt(triage.triage_low, 10) / totalTriaged) * 100,
            skip: (parseInt(triage.triage_skip, 10) / totalTriaged) * 100,
          },
          totalCredits: parseFloat(stats.total_credits) || 0,
          avgCreditsPerDigest: parseFloat(stats.avg_credits_per_digest) || 0,
          creditsByMode: {
            low: parseFloat(stats.credits_low) || 0,
            normal: parseFloat(stats.credits_normal) || 0,
            high: parseFloat(stats.credits_high) || 0,
          },
        },
        previousPeriod: {
          totalItems: parseInt(prevStats.total_items, 10),
          digestCount: parseInt(prevStats.digest_count, 10),
          avgItemsPerDigest: parseFloat(prevStats.avg_items_per_digest) || 0,
          avgTopScore: parseFloat(prevStats.avg_top_score) || 0,
          totalCredits: parseFloat(prevStats.total_credits) || 0,
          avgCreditsPerDigest: parseFloat(prevStats.avg_credits_per_digest) || 0,
        },
      };
    },
  );
}
