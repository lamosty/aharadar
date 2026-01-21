import type { Queryable } from "../db";

export interface BookmarkRow {
  id: string;
  user_id: string;
  content_item_id: string;
  created_at: string;
}

export function createBookmarksRepo(db: Queryable) {
  return {
    /**
     * Toggle bookmark state for a content item.
     * Returns the new bookmark if created, null if removed.
     */
    async toggle(params: {
      userId: string;
      contentItemId: string;
    }): Promise<{ bookmarked: boolean; bookmark: BookmarkRow | null }> {
      const { userId, contentItemId } = params;

      // Check if bookmark exists
      const existing = await db.query<{ id: string }>(
        `select id from bookmarks
         where user_id = $1 and content_item_id = $2::uuid`,
        [userId, contentItemId],
      );

      if (existing.rows[0]) {
        // Remove bookmark
        await db.query(`delete from bookmarks where id = $1::uuid`, [existing.rows[0].id]);
        return { bookmarked: false, bookmark: null };
      }

      // Create bookmark
      const res = await db.query<BookmarkRow>(
        `insert into bookmarks (user_id, content_item_id)
         values ($1, $2::uuid)
         returning id, user_id, content_item_id::text as content_item_id, created_at::text as created_at`,
        [userId, contentItemId],
      );

      const row = res.rows[0];
      if (!row) throw new Error("Failed to create bookmark");
      return { bookmarked: true, bookmark: row };
    },

    /**
     * Check if a content item is bookmarked by a user.
     */
    async isBookmarked(params: { userId: string; contentItemId: string }): Promise<boolean> {
      const res = await db.query<{ exists: boolean }>(
        `select exists(
           select 1 from bookmarks
           where user_id = $1 and content_item_id = $2::uuid
         ) as exists`,
        [params.userId, params.contentItemId],
      );
      return res.rows[0]?.exists ?? false;
    },

    /**
     * Get IDs of all bookmarked content items for a user.
     * Useful for Ask feature context integration.
     */
    async getBookmarkedItemIds(params: { userId: string }): Promise<string[]> {
      const res = await db.query<{ content_item_id: string }>(
        `select content_item_id::text as content_item_id
         from bookmarks
         where user_id = $1
         order by created_at desc`,
        [params.userId],
      );
      return res.rows.map((r) => r.content_item_id);
    },

    /**
     * List bookmarks for a user with pagination.
     * Returns bookmark rows with content item IDs.
     */
    async listByUser(params: {
      userId: string;
      limit: number;
      offset: number;
    }): Promise<{ bookmarks: BookmarkRow[]; total: number }> {
      const { userId, limit, offset } = params;

      // Get total count
      const countRes = await db.query<{ count: string }>(
        `select count(*)::text as count from bookmarks where user_id = $1`,
        [userId],
      );
      const total = parseInt(countRes.rows[0]?.count ?? "0", 10);

      // Get bookmarks
      const res = await db.query<BookmarkRow>(
        `select
           id,
           user_id,
           content_item_id::text as content_item_id,
           created_at::text as created_at
         from bookmarks
         where user_id = $1
         order by created_at desc
         limit $2 offset $3`,
        [userId, Math.max(1, Math.min(100, limit)), Math.max(0, offset)],
      );

      return { bookmarks: res.rows, total };
    },

    /**
     * Check bookmark status for multiple content items at once.
     * Returns a map of contentItemId -> boolean.
     */
    async getBulkBookmarkStatus(params: {
      userId: string;
      contentItemIds: string[];
    }): Promise<Record<string, boolean>> {
      if (params.contentItemIds.length === 0) return {};

      const res = await db.query<{ content_item_id: string }>(
        `select content_item_id::text as content_item_id
         from bookmarks
         where user_id = $1 and content_item_id = any($2::uuid[])`,
        [params.userId, params.contentItemIds],
      );

      const bookmarkedSet = new Set(res.rows.map((r) => r.content_item_id));
      const result: Record<string, boolean> = {};
      for (const id of params.contentItemIds) {
        result[id] = bookmarkedSet.has(id);
      }
      return result;
    },
  };
}
