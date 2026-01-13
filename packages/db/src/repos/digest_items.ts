import type { Queryable } from "../db";

export type DigestItemRef =
  | {
      clusterId: string;
      contentItemId: null;
      ahaScore: number;
      triageJson?: Record<string, unknown> | null;
      summaryJson?: Record<string, unknown> | null;
      entitiesJson?: Record<string, unknown> | null;
    }
  | {
      clusterId: null;
      contentItemId: string;
      ahaScore: number;
      triageJson?: Record<string, unknown> | null;
      summaryJson?: Record<string, unknown> | null;
      entitiesJson?: Record<string, unknown> | null;
    };

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
          `($1, $${idx}::uuid, $${idx + 1}::uuid, ${i + 1}, $${idx + 2}, $${idx + 3}::jsonb, $${idx + 4}::jsonb, $${idx + 5}::jsonb)`,
        );
        args.push(
          item.clusterId,
          item.contentItemId,
          item.ahaScore,
          item.triageJson ? JSON.stringify(item.triageJson) : null,
          item.summaryJson ? JSON.stringify(item.summaryJson) : null,
          item.entitiesJson ? JSON.stringify(item.entitiesJson) : null,
        );
        idx += 6;
      }

      await db.query(
        `insert into digest_items (digest_id, cluster_id, content_item_id, rank, aha_score, triage_json, summary_json, entities_json)
         values ${values.join(", ")}`,
        args,
      );
    },
  };
}
