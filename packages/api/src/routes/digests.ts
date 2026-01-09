import type { FastifyInstance } from "fastify";
import { getDb, getSingletonContext } from "../lib/db.js";

interface DigestListRow {
  id: string;
  mode: string;
  status: string;
  credits_used: string; // numeric comes as string from pg
  window_start: string;
  window_end: string;
  created_at: string;
  item_count: string; // bigint comes as string from pg
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

export async function digestsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Querystring: { from?: string; to?: string } }>(
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

      const { from, to } = request.query;

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

      const db = getDb();
      const now = new Date();
      const defaultFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const defaultTo = now.toISOString();

      const fromDate = from ?? defaultFrom;
      const toDate = to ?? defaultTo;

      const result = await db.query<DigestListRow>(
        `SELECT
         d.id,
         d.mode,
         d.status,
         d.credits_used,
         d.source_results,
         d.window_start::text,
         d.window_end::text,
         d.created_at::text,
         (SELECT COUNT(*) FROM digest_items di WHERE di.digest_id = d.id) as item_count
       FROM digests d
       WHERE d.user_id = $1 AND d.topic_id = $2::uuid
         AND d.created_at >= $3::timestamptz AND d.created_at <= $4::timestamptz
       ORDER BY d.created_at DESC
       LIMIT 100`,
        [ctx.userId, ctx.topicId, fromDate, toDate],
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
            mode: row.mode,
            status: row.status,
            creditsUsed: parseFloat(row.credits_used) || 0,
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

    if (digest.user_id !== ctx.userId || digest.topic_id !== ctx.topicId) {
      return reply.code(403).send({
        ok: false,
        error: {
          code: "FORBIDDEN",
          message: "Digest does not belong to current user/topic",
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
}
