import type { Queryable } from "../db";

export interface EmbeddingUpsert {
  contentItemId: string;
  model: string;
  dims: number;
  vector: number[]; // must match embeddings.vector dims (currently 1536)
}

export interface EmbeddingCandidateRow {
  content_item_id: string;
  title: string | null;
  body_text: string | null;
  canonical_url: string | null;
  metadata_json: Record<string, unknown>;
  published_at: string | null;
  fetched_at: string;
  hash_text: string | null;
  source_id: string;
  source_type: string;
  source_name: string | null;
  embedding_model: string | null;
  embedding_dims: number | null;
  embedding_created_at: string | null;
}

function asVectorLiteral(vector: number[]): string {
  // pgvector accepts '[1,2,3]' string input.
  // We keep it stable and locale-independent (always '.' decimal).
  return `[${vector.map((n) => (Number.isFinite(n) ? n : 0)).join(",")}]`;
}

export interface EmbeddingRow {
  content_item_id: string;
  model: string;
  dims: number;
  vector_text: string;
}

function parseVectorText(text: string): number[] | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return null;
  const inner = trimmed.slice(1, -1).trim();
  if (inner.length === 0) return [];
  const parts = inner.split(",");
  const out: number[] = [];
  for (const p of parts) {
    const n = Number.parseFloat(p);
    if (!Number.isFinite(n)) return null;
    out.push(n);
  }
  return out;
}

export function createEmbeddingsRepo(db: Queryable) {
  return {
    async getByContentItemId(
      contentItemId: string,
    ): Promise<{ model: string; dims: number; vector: number[] } | null> {
      const res = await db.query<EmbeddingRow>(
        `select
           content_item_id::text as content_item_id,
           model,
           dims,
           vector::text as vector_text
         from embeddings
         where content_item_id = $1::uuid`,
        [contentItemId],
      );
      const row = res.rows[0];
      if (!row) return null;
      const vector = parseVectorText(row.vector_text);
      if (!vector) return null;
      return { model: row.model, dims: row.dims, vector };
    },

    async upsert(params: EmbeddingUpsert): Promise<{ inserted: boolean }> {
      const res = await db.query<{ inserted: boolean }>(
        `insert into embeddings (content_item_id, model, dims, vector)
         values ($1::uuid, $2, $3, $4::vector)
         on conflict (content_item_id)
         do update set
           model = excluded.model,
           dims = excluded.dims,
           vector = excluded.vector,
           created_at = now()
         returning (xmax = 0) as inserted`,
        [params.contentItemId, params.model, params.dims, asVectorLiteral(params.vector)],
      );
      const row = res.rows[0];
      if (!row) throw new Error("embeddings.upsert failed: no row returned");
      return row;
    },

    async listNeedingEmbedding(params: {
      userId: string;
      topicId: string;
      model: string;
      dims: number;
      limit: number;
      windowStart?: string;
      windowEnd?: string;
    }): Promise<EmbeddingCandidateRow[]> {
      const limit = Math.max(1, Math.min(5_000, Math.floor(params.limit)));

      const args: unknown[] = [params.userId, params.topicId, params.model, params.dims];
      let windowWhere = "";
      if (params.windowStart && params.windowEnd) {
        args.push(params.windowStart, params.windowEnd);
        windowWhere = ` and coalesce(ci.published_at, ci.fetched_at) >= $${args.length - 1}::timestamptz
                       and coalesce(ci.published_at, ci.fetched_at) < $${args.length}::timestamptz`;
      }

      args.push(limit);

      const res = await db.query<EmbeddingCandidateRow>(
        `with topic_item_source as (
           select distinct on (cis.content_item_id)
             cis.content_item_id,
             cis.source_id
           from content_item_sources cis
           join sources s on s.id = cis.source_id
           where s.user_id = $1
             and s.topic_id = $2::uuid
           order by cis.content_item_id, cis.added_at desc
         )
         select
           ci.id::text as content_item_id,
           ci.title,
           ci.body_text,
           ci.canonical_url,
           ci.metadata_json,
           ci.published_at::text as published_at,
           ci.fetched_at::text as fetched_at,
           ci.hash_text,
           tis.source_id::text as source_id,
           s.type as source_type,
           s.name as source_name,
           e.model as embedding_model,
           e.dims as embedding_dims,
           e.created_at::text as embedding_created_at
         from content_items ci
         join topic_item_source tis on tis.content_item_id = ci.id
         join sources s on s.id = tis.source_id
         left join embeddings e on e.content_item_id = ci.id
         where ci.user_id = $1
           and ci.deleted_at is null
           and ci.duplicate_of_content_item_id is null
           and (
             e.content_item_id is null
             or ci.hash_text is null
             or e.model <> $3
             or e.dims <> $4
           )
           ${windowWhere}
         order by coalesce(ci.published_at, ci.fetched_at) desc
         limit $${args.length}`,
        args,
      );

      return res.rows;
    },
  };
}
