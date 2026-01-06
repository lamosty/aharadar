import type { FastifyInstance } from "fastify";
import { getDb, getSingletonContext } from "../lib/db.js";

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

export async function itemsRoutes(fastify: FastifyInstance): Promise<void> {
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
