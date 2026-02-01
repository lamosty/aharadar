import type { Queryable } from "../db";

interface DigestItemBase {
  ahaScore: number;
  triageJson?: Record<string, unknown> | null;
  summaryJson?: Record<string, unknown> | null;
  entitiesJson?: Record<string, unknown> | null;
  /** Embedding of the triage theme string (for re-clustering) */
  triageThemeVector?: number[] | null;
  /** Clustered theme label (result of embedding-based grouping) */
  themeLabel?: string | null;
}

export type DigestItemRef =
  | (DigestItemBase & { clusterId: string; contentItemId: null })
  | (DigestItemBase & { clusterId: null; contentItemId: string });

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
        values.push(
          `($1, $${idx}::uuid, $${idx + 1}::uuid, ${i + 1}, $${idx + 2}, $${idx + 3}::jsonb, $${idx + 4}::jsonb, $${idx + 5}::jsonb, $${idx + 6}::vector, $${idx + 7})`,
        );
        args.push(
          item.clusterId,
          item.contentItemId,
          item.ahaScore,
          item.triageJson ? JSON.stringify(item.triageJson) : null,
          item.summaryJson ? JSON.stringify(item.summaryJson) : null,
          item.entitiesJson ? JSON.stringify(item.entitiesJson) : null,
          item.triageThemeVector ? `[${item.triageThemeVector.join(",")}]` : null,
          item.themeLabel ?? null,
        );
        idx += 8;
      }

      await db.query(
        `insert into digest_items (digest_id, cluster_id, content_item_id, rank, aha_score, triage_json, summary_json, entities_json, triage_theme_vector, theme_label)
         values ${values.join(", ")}`,
        args,
      );
    },
  };
}
