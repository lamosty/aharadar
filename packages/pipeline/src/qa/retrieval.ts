/**
 * Q&A retrieval - cluster-based semantic search for question answering.
 *
 * Architecture:
 * Question → Embed → Search clusters (topic-scoped) → Top K clusters →
 *   → Fetch representative items per cluster → Return context
 */

import type { Db } from "@aharadar/db";
import type { BudgetTier } from "@aharadar/shared";
import { createEnvEmbeddingsClient } from "@aharadar/llm";

export interface RetrievedItem {
  id: string;
  title: string;
  bodyText: string;
  url: string;
  sourceType: string;
  publishedAt: string;
}

export interface RetrievedCluster {
  id: string;
  summary: string;
  items: RetrievedItem[];
}

export interface RetrievedContext {
  clusters: RetrievedCluster[];
  totalItems: number;
  embeddingCost: {
    inputTokens: number;
    costEstimateCredits: number;
    provider: string;
    model: string;
    endpoint: string;
  };
}

interface ClusterSearchRow {
  cluster_id: string;
  centroid_text: string | null;
  representative_content_item_id: string | null;
  similarity: number;
  summary: string | null;
}

interface ClusterItemRow {
  content_item_id: string;
  title: string | null;
  body_text: string | null;
  canonical_url: string | null;
  source_type: string;
  published_at: string | null;
  similarity: number;
}

function asVectorLiteral(vector: number[]): string {
  return `[${vector.map((n) => (Number.isFinite(n) ? n : 0)).join(",")}]`;
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + "...";
}

export async function retrieveContext(params: {
  db: Db;
  question: string;
  userId: string;
  topicId: string;
  tier: BudgetTier;
  options?: { maxClusters?: number; timeWindow?: { from?: string; to?: string } };
}): Promise<RetrievedContext> {
  const maxClusters = params.options?.maxClusters ?? 5;
  const embeddingsClient = createEnvEmbeddingsClient();

  // 1. Embed the question
  const ref = embeddingsClient.chooseModel(params.tier);
  const embedResult = await embeddingsClient.embed(ref, [params.question]);
  const embedding = embedResult.vectors[0];
  if (!embedding || embedding.length === 0) {
    throw new Error("Failed to generate embedding for question");
  }

  // 2. Search clusters by centroid similarity (topic-scoped)
  // Build time window filter if provided
  let timeFilter = "";
  const queryArgs: unknown[] = [params.userId, params.topicId, asVectorLiteral(embedding), maxClusters];

  if (params.options?.timeWindow?.from) {
    queryArgs.push(params.options.timeWindow.from);
    timeFilter += ` and c.updated_at >= $${queryArgs.length}::timestamptz`;
  }
  if (params.options?.timeWindow?.to) {
    queryArgs.push(params.options.timeWindow.to);
    timeFilter += ` and c.updated_at <= $${queryArgs.length}::timestamptz`;
  }

  const clustersRes = await params.db.query<ClusterSearchRow>(
    `select
       c.id::text as cluster_id,
       c.centroid_vector::text as centroid_text,
       c.representative_content_item_id::text as representative_content_item_id,
       (1 - (c.centroid_vector <=> $3::vector))::float8 as similarity,
       c.summary
     from clusters c
     where c.user_id = $1::uuid
       and c.centroid_vector is not null
       ${timeFilter}
       and exists (
         select 1 from cluster_items cli
         join content_item_sources cis on cis.content_item_id = cli.content_item_id
         join sources s on s.id = cis.source_id
         where cli.cluster_id = c.id
           and s.topic_id = $2::uuid
       )
     order by c.centroid_vector <=> $3::vector asc
     limit $4`,
    queryArgs
  );

  const similarClusters = clustersRes.rows.filter((r) => r.similarity >= 0.3);

  // 3. For each cluster, fetch top items with their content
  const clustersWithItems: RetrievedCluster[] = [];
  let totalItems = 0;

  for (const cluster of similarClusters) {
    const itemsRes = await params.db.query<ClusterItemRow>(
      `select
         ci.id::text as content_item_id,
         ci.title,
         ci.body_text,
         ci.canonical_url,
         ci.source_type,
         ci.published_at::text as published_at,
         cli.similarity
       from cluster_items cli
       join content_items ci on ci.id = cli.content_item_id
       where cli.cluster_id = $1::uuid
         and ci.deleted_at is null
       order by cli.similarity desc
       limit 3`,
      [cluster.cluster_id]
    );

    const items: RetrievedItem[] = itemsRes.rows.map((item) => ({
      id: item.content_item_id,
      title: item.title ?? "(no title)",
      bodyText: truncate(item.body_text ?? "", 2000),
      url: item.canonical_url ?? "",
      sourceType: item.source_type,
      publishedAt: item.published_at ?? "",
    }));

    totalItems += items.length;

    clustersWithItems.push({
      id: cluster.cluster_id,
      summary: cluster.summary ?? "",
      items,
    });
  }

  return {
    clusters: clustersWithItems,
    totalItems,
    embeddingCost: {
      inputTokens: embedResult.inputTokens,
      costEstimateCredits: embedResult.costEstimateCredits,
      provider: embedResult.provider,
      model: embedResult.model,
      endpoint: embedResult.endpoint,
    },
  };
}
