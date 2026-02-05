import type { FastifyInstance } from "fastify";
import { getDb, getSingletonContext } from "../lib/db.js";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_REGEX.test(value);
}

interface ToggleBookmarkBody {
  contentItemId: string;
}

export async function bookmarksRoutes(fastify: FastifyInstance): Promise<void> {
  // POST /bookmarks - Toggle bookmark for a content item
  fastify.post<{ Body: ToggleBookmarkBody }>("/bookmarks", async (request, reply) => {
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

    const { contentItemId } = body as Record<string, unknown>;

    if (!isValidUuid(contentItemId)) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "INVALID_PARAM",
          message: "contentItemId must be a valid UUID",
        },
      });
    }

    const db = getDb();
    const result = await db.bookmarks.toggle({
      userId: ctx.userId,
      contentItemId,
    });

    return { ok: true, bookmarked: result.bookmarked };
  });

  // GET /bookmarks - List bookmarked items with pagination
  fastify.get<{ Querystring: { limit?: string; offset?: string } }>(
    "/bookmarks",
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

      const limit = request.query.limit ? parseInt(request.query.limit, 10) : 20;
      const offset = request.query.offset ? parseInt(request.query.offset, 10) : 0;

      if (Number.isNaN(limit) || limit < 1 || limit > 100) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: "INVALID_PARAM",
            message: "limit must be a number between 1 and 100",
          },
        });
      }

      if (Number.isNaN(offset) || offset < 0) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: "INVALID_PARAM",
            message: "offset must be a non-negative number",
          },
        });
      }

      const db = getDb();
      const { bookmarks, total } = await db.bookmarks.listByUser({
        userId: ctx.userId,
        limit,
        offset,
      });

      // Get the full content item details for each bookmark
      const contentItemIds = bookmarks.map((b) => b.content_item_id);
      if (contentItemIds.length === 0) {
        return {
          ok: true,
          items: [],
          pagination: {
            total,
            limit,
            offset,
            hasMore: false,
          },
        };
      }

      // Fetch content items with digest info (similar to items endpoint)
      const itemsRes = await db.query<{
        id: string;
        title: string | null;
        body_text: string | null;
        url: string | null;
        external_id: string | null;
        author: string | null;
        published_at: string | null;
        source_type: string;
        source_id: string;
        metadata: Record<string, unknown> | null;
        bookmarked_at: string;
      }>(
        `select
           ci.id::text as id,
           ci.title,
           ci.body_text,
           ci.canonical_url as url,
           ci.external_id,
           ci.author,
           ci.published_at::text as published_at,
           ci.source_type,
           cis.source_id::text as source_id,
           ci.metadata_json as metadata,
           b.created_at::text as bookmarked_at
         from content_items ci
         join bookmarks b on b.content_item_id = ci.id
         left join content_item_sources cis on cis.content_item_id = ci.id
         where ci.id = any($1::uuid[])
           and b.user_id = $2
         order by b.created_at desc`,
        [contentItemIds, ctx.userId],
      );

      const items = itemsRes.rows.map((row) => ({
        id: row.id,
        item: {
          title: row.title,
          bodyText: row.body_text,
          url: row.url,
          externalId: row.external_id,
          author: row.author,
          publishedAt: row.published_at,
          sourceType: row.source_type,
          sourceId: row.source_id,
          metadata: row.metadata,
        },
        bookmarkedAt: row.bookmarked_at,
      }));

      return {
        ok: true,
        items,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + limit < total,
        },
      };
    },
  );

  // GET /bookmarks/:contentItemId - Check if item is bookmarked
  fastify.get<{ Params: { contentItemId: string } }>(
    "/bookmarks/:contentItemId",
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

      const { contentItemId } = request.params;

      if (!isValidUuid(contentItemId)) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: "INVALID_PARAM",
            message: "contentItemId must be a valid UUID",
          },
        });
      }

      const db = getDb();
      const bookmarked = await db.bookmarks.isBookmarked({
        userId: ctx.userId,
        contentItemId,
      });

      return { ok: true, bookmarked };
    },
  );

  // POST /bookmarks/bulk-status - Check bookmark status for multiple items
  fastify.post<{ Body: { contentItemIds: string[] } }>(
    "/bookmarks/bulk-status",
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

      const { contentItemIds } = body as Record<string, unknown>;

      if (!Array.isArray(contentItemIds)) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: "INVALID_PARAM",
            message: "contentItemIds must be an array",
          },
        });
      }

      // Validate all UUIDs
      for (const id of contentItemIds) {
        if (!isValidUuid(id)) {
          return reply.code(400).send({
            ok: false,
            error: {
              code: "INVALID_PARAM",
              message: `Invalid UUID: ${id}`,
            },
          });
        }
      }

      const db = getDb();
      const status = await db.bookmarks.getBulkBookmarkStatus({
        userId: ctx.userId,
        contentItemIds,
      });

      return { ok: true, status };
    },
  );
}
