import type { FastifyInstance } from "fastify";
import {
  buildBookmarkRemovedEvent,
  buildBookmarkSavedEvent,
  createTraceId,
} from "../integration/contracts.js";
import { getIntegrationPorts, TimeoutError, withTimeout } from "../integration/ports.js";
import { getDb, getSingletonContext } from "../lib/db.js";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_REGEX.test(value);
}

interface ToggleBookmarkBody {
  contentItemId: string;
}

interface BookmarkContentRow {
  title: string | null;
  canonical_url: string | null;
  source_type: string | null;
}

async function emitBookmarkToggleEvent(params: {
  fastify: FastifyInstance;
  userId: string;
  sessionRef: string;
  traceId: string;
  contentItemId: string;
  bookmarked: boolean;
  bookmarkId: string;
  occurredAt: string;
}) {
  const db = getDb();

  let contentTitle: string | null = null;
  let contentUrl: string | null = null;
  let sourceType: string | null = null;

  try {
    const contentRes = await db.query<BookmarkContentRow>(
      `select title, canonical_url, source_type
       from content_items
       where id = $1::uuid
       limit 1`,
      [params.contentItemId],
    );
    contentTitle = contentRes.rows[0]?.title ?? null;
    contentUrl = contentRes.rows[0]?.canonical_url ?? null;
    sourceType = contentRes.rows[0]?.source_type ?? null;
  } catch (err) {
    params.fastify.log.warn(
      {
        err: err instanceof Error ? err.message : String(err),
        trace_id: params.traceId,
        content_item_id: params.contentItemId,
      },
      "Failed to load content metadata for bookmark event; emitting without metadata",
    );
  }

  const event = params.bookmarked
    ? buildBookmarkSavedEvent({
        traceId: params.traceId,
        userRef: params.userId,
        sessionRef: params.sessionRef,
        contentItemId: params.contentItemId,
        contentTitle,
        contentUrl,
        sourceType,
        bookmarkId: params.bookmarkId,
        savedAt: params.occurredAt,
      })
    : buildBookmarkRemovedEvent({
        traceId: params.traceId,
        userRef: params.userId,
        sessionRef: params.sessionRef,
        contentItemId: params.contentItemId,
        contentTitle,
        contentUrl,
        bookmarkId: params.bookmarkId,
        removedAt: params.occurredAt,
      });

  const { eventSink, eventSinkTimeoutMs } = getIntegrationPorts();

  try {
    await withTimeout(eventSink.publish(event), eventSinkTimeoutMs, "eventSink.publish(bookmark)");
  } catch (err) {
    params.fastify.log.warn(
      {
        err: err instanceof Error ? err.message : String(err),
        trace_id: params.traceId,
        idempotency_key: event.idempotency_key,
        event_type: event.event_type,
        timeout_ms: err instanceof TimeoutError ? err.timeoutMs : undefined,
      },
      "Bookmark event sink publish failed (fail-open)",
    );
  }
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

    let previousBookmarkId: string | null = null;
    try {
      const previousBookmark = await db.query<{ id: string }>(
        `select id::text as id
         from bookmarks
         where user_id = $1 and content_item_id = $2::uuid
         limit 1`,
        [ctx.userId, contentItemId],
      );
      previousBookmarkId = previousBookmark.rows[0]?.id ?? null;
    } catch (err) {
      fastify.log.warn(
        {
          err: err instanceof Error ? err.message : String(err),
          content_item_id: contentItemId,
        },
        "Failed to load existing bookmark id before toggle",
      );
    }

    const result = await db.bookmarks.toggle({
      userId: ctx.userId,
      contentItemId,
    });

    const traceId = createTraceId(request.headers["x-trace-id"], request.id);
    const eventTime = result.bookmarked
      ? (result.bookmark?.created_at ?? new Date().toISOString())
      : new Date().toISOString();
    const bookmarkId =
      result.bookmark?.id ?? previousBookmarkId ?? `bookmark:${ctx.userId}:${contentItemId}`;

    await emitBookmarkToggleEvent({
      fastify,
      userId: ctx.userId,
      sessionRef: request.id,
      traceId,
      contentItemId,
      bookmarked: result.bookmarked,
      bookmarkId,
      occurredAt: eventTime,
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
