import type { Queryable } from "../db";

function isPgUniqueViolation(err: unknown, constraint: string): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: unknown; constraint?: unknown };
  return e.code === "23505" && e.constraint === constraint;
}

export interface ContentItemUpsert {
  userId: string;
  sourceId: string;
  sourceType: string;
  externalId: string | null;
  canonicalUrl: string | null;
  title: string | null;
  bodyText: string | null;
  author: string | null;
  publishedAt: string | null; // ISO
  language: string | null;
  metadata: Record<string, unknown>;
  raw: unknown | null;
  hashUrl: string | null;
  hashText: string | null;
}

export interface ContentItemUpsertResult {
  id: string;
  inserted: boolean;
}

export interface ContentItemListRow {
  id: string;
  source_type: string;
  title: string | null;
  canonical_url: string | null;
  external_id: string | null;
  author: string | null;
  published_at: string | null;
  fetched_at: string;
  metadata_json: Record<string, unknown>;
}

export function createContentItemsRepo(db: Queryable) {
  async function upsertByExternalId(item: ContentItemUpsert): Promise<ContentItemUpsertResult> {
    const res = await db.query<{ id: string; inserted: boolean }>(
      `insert into content_items (
         user_id,
         source_id,
         source_type,
         external_id,
         canonical_url,
         title,
         body_text,
         author,
         published_at,
         language,
         metadata_json,
         raw_json,
         hash_url,
         hash_text
       ) values (
         $1, $2, $3, $4, $5,
         $6, $7, $8, $9::timestamptz, $10,
         $11::jsonb, $12::jsonb, $13, $14
       )
       on conflict (source_id, external_id) where external_id is not null
       do update set
         canonical_url = excluded.canonical_url,
         title = excluded.title,
         body_text = excluded.body_text,
         author = excluded.author,
         published_at = excluded.published_at,
         fetched_at = now(),
         language = excluded.language,
         metadata_json = excluded.metadata_json,
         raw_json = excluded.raw_json,
         hash_url = excluded.hash_url,
         hash_text = excluded.hash_text
       returning id, (xmax = 0) as inserted`,
      [
        item.userId,
        item.sourceId,
        item.sourceType,
        item.externalId,
        item.canonicalUrl,
        item.title,
        item.bodyText,
        item.author,
        item.publishedAt,
        item.language,
        JSON.stringify(item.metadata ?? {}),
        item.raw ? JSON.stringify(item.raw) : null,
        item.hashUrl,
        item.hashText,
      ],
    );
    const row = res.rows[0];
    if (!row) throw new Error("Failed to upsert content_item");
    return row;
  }

  async function upsertByHashUrl(item: ContentItemUpsert): Promise<ContentItemUpsertResult> {
    const res = await db.query<{ id: string; inserted: boolean }>(
      `insert into content_items (
         user_id,
         source_id,
         source_type,
         external_id,
         canonical_url,
         title,
         body_text,
         author,
         published_at,
         language,
         metadata_json,
         raw_json,
         hash_url,
         hash_text
       ) values (
         $1, $2, $3, $4, $5,
         $6, $7, $8, $9::timestamptz, $10,
         $11::jsonb, $12::jsonb, $13, $14
       )
       on conflict (hash_url) where hash_url is not null
       do update set
         title = coalesce(content_items.title, excluded.title),
         body_text = coalesce(content_items.body_text, excluded.body_text),
         author = coalesce(content_items.author, excluded.author),
         published_at = coalesce(content_items.published_at, excluded.published_at),
         fetched_at = now(),
         language = coalesce(content_items.language, excluded.language),
         metadata_json = content_items.metadata_json || excluded.metadata_json,
         raw_json = coalesce(content_items.raw_json, excluded.raw_json),
         hash_text = coalesce(content_items.hash_text, excluded.hash_text)
       returning id, (xmax = 0) as inserted`,
      [
        item.userId,
        item.sourceId,
        item.sourceType,
        item.externalId,
        item.canonicalUrl,
        item.title,
        item.bodyText,
        item.author,
        item.publishedAt,
        item.language,
        JSON.stringify(item.metadata ?? {}),
        item.raw ? JSON.stringify(item.raw) : null,
        item.hashUrl,
        item.hashText,
      ],
    );
    const row = res.rows[0];
    if (!row) throw new Error("Failed to upsert content_item (hash_url)");
    return row;
  }

  return {
    async upsert(item: ContentItemUpsert): Promise<ContentItemUpsertResult> {
      if (item.externalId) {
        try {
          return await upsertByExternalId(item);
        } catch (err) {
          // If the same canonical URL already exists (common across sources), dedupe by hash_url instead of failing.
          if (item.hashUrl && isPgUniqueViolation(err, "content_items_hash_url_uniq")) {
            return await upsertByHashUrl({ ...item, externalId: null });
          }
          throw err;
        }
      }

      if (item.hashUrl) {
        return await upsertByHashUrl(item);
      }

      throw new Error("Content item must have externalId or hashUrl for idempotent upsert");
    },

    async listRecentByUser(userId: string, limit: number): Promise<ContentItemListRow[]> {
      const res = await db.query<ContentItemListRow>(
        `select id, source_type, title, canonical_url, external_id, author, published_at, fetched_at, metadata_json
         from content_items
         where user_id = $1 and deleted_at is null
         order by fetched_at desc
         limit $2`,
        [userId, limit],
      );
      return res.rows;
    },
  };
}
