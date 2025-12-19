import type { Queryable } from "../db";

export type DigestItemRef = { contentItemId: string; score: number };

export function createDigestItemsRepo(db: Queryable) {
  return {
    async replaceForDigest(params: { digestId: string; items: DigestItemRef[] }): Promise<void> {
      await db.query("delete from digest_items where digest_id = $1", [params.digestId]);
      if (params.items.length === 0) return;

      const values: string[] = [];
      const args: unknown[] = [params.digestId];
      let idx = 2;

      for (let i = 0; i < params.items.length; i += 1) {
        const item = params.items[i]!;
        // digest_id is always $1
        // rank is i+1 (1-based)
        values.push(`($1, $${idx}, ${i + 1}, $${idx + 1})`);
        args.push(item.contentItemId, item.score);
        idx += 2;
      }

      await db.query(
        `insert into digest_items (digest_id, content_item_id, rank, score)
         values ${values.join(", ")}`,
        args
      );
    },
  };
}


