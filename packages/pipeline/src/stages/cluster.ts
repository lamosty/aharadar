import type { Db } from "@aharadar/db";
import { createLogger } from "@aharadar/shared";

const log = createLogger({ component: "cluster" });

export interface ClusterLimits {
  /** Max number of (topic-scoped) items to cluster per run. */
  maxItems: number;
  /** Only consider clusters updated within this lookback window (runtime control). */
  clusterLookbackDays: number;
  /** Similarity threshold for assigning to an existing cluster. */
  similarityThreshold: number;
  /** Whether to update centroid vectors as clusters grow (recommended). */
  updateCentroid: boolean;
}

export interface ClusterRunResult {
  attempted: number;
  attachedToExisting: number;
  created: number;
  skipped: number;
  errors: number;
}

type CandidateRow = {
  content_item_id: string;
  vector_text: string;
};

type NearestClusterRow = {
  cluster_id: string;
  centroid_text: string | null;
  member_count: number;
  similarity: number;
  representative_content_item_id: string | null;
};

function parseIntEnv(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseFloatEnv(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseIsoMs(value: string): number {
  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms)) throw new Error(`Invalid ISO timestamp: ${value}`);
  return ms;
}

function clamp01(x: number): number {
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
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

function asVectorLiteral(vector: number[]): string {
  return `[${vector.map((n) => (Number.isFinite(n) ? n : 0)).join(",")}]`;
}

/**
 * Cluster topic-scoped content items into user-level story clusters.
 *
 * Current behavior:
 * - Excludes all signal items (signal connector is bundle-only; see docs/connectors.md).
 * - Requires embeddings (pgvector) to assign items to clusters.
 * - Each content item is assigned to at most one cluster (idempotent across topics).
 */
export async function clusterTopicContentItems(params: {
  db: Db;
  userId: string;
  topicId: string;
  windowStart: string;
  windowEnd: string;
  limits?: Partial<ClusterLimits>;
}): Promise<ClusterRunResult> {
  const maxItems = params.limits?.maxItems ?? parseIntEnv(process.env.CLUSTER_MAX_ITEMS_PER_RUN) ?? 500;
  const clusterLookbackDays =
    params.limits?.clusterLookbackDays ?? parseIntEnv(process.env.CLUSTER_LOOKBACK_DAYS) ?? 7;
  const similarityThreshold =
    params.limits?.similarityThreshold ?? parseFloatEnv(process.env.CLUSTER_SIM_THRESHOLD) ?? 0.86;
  const updateCentroid = params.limits?.updateCentroid ?? process.env.CLUSTER_UPDATE_CENTROID !== "false";

  const limit = Math.max(0, Math.min(5_000, Math.floor(maxItems)));
  if (limit === 0) return { attempted: 0, attachedToExisting: 0, created: 0, skipped: 0, errors: 0 };

  const lookbackStartIso = new Date(
    parseIsoMs(params.windowEnd) - Math.max(0, clusterLookbackDays) * 24 * 60 * 60 * 1000
  ).toISOString();

  const threshold = clamp01(similarityThreshold);

  // Pick topic-scoped, in-window candidates that:
  // - have embeddings
  // - are not marked duplicates
  // - have not yet been clustered
  const candidatesRes = await params.db.query<CandidateRow>(
    `with topic_membership as (
       select distinct cis.content_item_id
       from content_item_sources cis
       join sources s on s.id = cis.source_id
       where s.user_id = $1
         and s.topic_id = $2::uuid
     )
     select
       ci.id::text as content_item_id,
       e.vector::text as vector_text
     from content_items ci
     join embeddings e on e.content_item_id = ci.id
     join topic_membership tm on tm.content_item_id = ci.id
     where ci.user_id = $1
       and ci.deleted_at is null
       and ci.duplicate_of_content_item_id is null
       and ci.source_type <> 'signal'
       and coalesce(ci.published_at, ci.fetched_at) >= $3::timestamptz
       and coalesce(ci.published_at, ci.fetched_at) < $4::timestamptz
       and not exists (
         select 1 from cluster_items cli
         where cli.content_item_id = ci.id
       )
     order by coalesce(ci.published_at, ci.fetched_at) desc
     limit $5`,
    [params.userId, params.topicId, params.windowStart, params.windowEnd, limit]
  );

  const candidates = candidatesRes.rows;
  if (candidates.length === 0)
    return { attempted: 0, attachedToExisting: 0, created: 0, skipped: 0, errors: 0 };

  let attempted = 0;
  let attachedToExisting = 0;
  let created = 0;
  let skipped = 0;
  let errors = 0;

  await params.db.tx(async (tx) => {
    for (const row of candidates) {
      attempted += 1;
      const vectorText = row.vector_text;
      if (!vectorText || vectorText.trim().length === 0) {
        skipped += 1;
        continue;
      }

      try {
        const nearest = await tx.query<NearestClusterRow>(
          `select
             c.id::text as cluster_id,
             c.centroid_vector::text as centroid_text,
             (select count(*)::int from cluster_items where cluster_id = c.id) as member_count,
             (1 - (c.centroid_vector <=> $2::vector))::float8 as similarity,
             c.representative_content_item_id::text as representative_content_item_id
           from clusters c
           where c.user_id = $1
             and c.centroid_vector is not null
             and c.updated_at >= $3::timestamptz
           order by c.centroid_vector <=> $2::vector asc
           limit 1`,
          [params.userId, vectorText, lookbackStartIso]
        );

        const best = nearest.rows[0] ?? null;
        const bestSim = best ? (Number.isFinite(best.similarity) ? (best.similarity as number) : 0) : 0;

        if (!best || bestSim < threshold) {
          // Create a new cluster anchored by this item.
          const inserted = await tx.query<{ id: string }>(
            `insert into clusters (user_id, representative_content_item_id, centroid_vector, top_terms_json)
             values ($1::uuid, $2::uuid, $3::vector, '{}'::jsonb)
             returning id::text as id`,
            [params.userId, row.content_item_id, vectorText]
          );
          const newId = inserted.rows[0]?.id;
          if (!newId) throw new Error("clusters insert failed: no id returned");

          await tx.query(
            `insert into cluster_items (cluster_id, content_item_id, similarity)
             values ($1::uuid, $2::uuid, $3)`,
            [newId, row.content_item_id, 1.0]
          );
          created += 1;
          continue;
        }

        // Attach to existing cluster.
        const attachRes = await tx.query<{ inserted: boolean }>(
          `insert into cluster_items (cluster_id, content_item_id, similarity)
           values ($1::uuid, $2::uuid, $3)
           on conflict (cluster_id, content_item_id)
           do update set similarity = excluded.similarity
           returning (xmax = 0) as inserted`,
          [best.cluster_id, row.content_item_id, bestSim]
        );
        const inserted = attachRes.rows[0]?.inserted ?? false;
        if (!inserted) {
          skipped += 1;
          continue;
        }

        attachedToExisting += 1;

        // Keep the cluster "hot".
        await tx.query(`update clusters set updated_at = now() where id = $1::uuid`, [best.cluster_id]);

        // Fill representative if missing (should be rare).
        if (!best.representative_content_item_id) {
          await tx.query(
            `update clusters set representative_content_item_id = $2::uuid where id = $1::uuid and representative_content_item_id is null`,
            [best.cluster_id, row.content_item_id]
          );
        }

        if (updateCentroid) {
          const centroidText = best.centroid_text;
          const centroidVec = centroidText ? parseVectorText(centroidText) : null;
          const itemVec = parseVectorText(vectorText);
          if (!centroidVec || !itemVec || centroidVec.length !== itemVec.length || centroidVec.length === 0) {
            continue;
          }

          const nBefore = Math.max(0, Math.floor(best.member_count));
          const nAfter = nBefore + 1;
          const next: number[] = new Array(itemVec.length);
          for (let i = 0; i < itemVec.length; i += 1) {
            next[i] = (centroidVec[i]! * nBefore + itemVec[i]!) / nAfter;
          }

          await tx.query(
            `update clusters
             set centroid_vector = $2::vector,
                 updated_at = now()
             where id = $1::uuid`,
            [best.cluster_id, asVectorLiteral(next)]
          );
        }
      } catch (err) {
        errors += 1;
        log.warn({ contentItemId: row.content_item_id, err }, "Cluster stage failed for content item");
      }
    }
  });

  return { attempted, attachedToExisting, created, skipped, errors };
}
