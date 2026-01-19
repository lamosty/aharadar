/**
 * Q&A retrieval - cluster-based semantic search for question answering.
 *
 * Architecture:
 * Question → Embed → Search clusters (topic-scoped) → Top K clusters →
 *   → Fetch representative items per cluster → Return context
 */

import type { Db } from "@aharadar/db";
import { createEnvEmbeddingsClient } from "@aharadar/llm";
import type { BudgetTier } from "@aharadar/shared";

export interface RetrievedItem {
  id: string;
  title: string;
  bodyText: string;
  /** Latest manual summary saved by user (if any) */
  manualSummaryJson?: Record<string, unknown> | null;
  /** Latest triage JSON from most recent digest (if any) */
  triageJson?: Record<string, unknown> | null;
  /** Latest deep summary JSON from most recent digest (if any) */
  summaryJson?: Record<string, unknown> | null;
  /** Latest feedback action for this item (if any) */
  feedbackAction?: string | null;
  url: string;
  sourceType: string;
  publishedAt: string;
  similarity: number;
}

export interface RetrievedCluster {
  id: string;
  /**
   * Optional cluster summary (currently empty; schema does not yet store this).
   * Keep the field for forward compatibility with future cluster summaries.
   */
  summary: string;
  similarity: number;
  items: RetrievedItem[];
}

export interface RetrievedContext {
  clusters: RetrievedCluster[];
  totalItems: number;
  /** Relevant prior Q&A turns for this topic (bounded), if any */
  memoryTurns?: Array<{
    conversationId: string;
    similarity: number;
    createdAt: string;
    question: string;
    answer: string;
  }>;
  /** Optional summary for the active conversation */
  conversationSummary?: string | null;
  /** Total clusters searched before filtering */
  clustersSearched: number;
  /** Minimum similarity threshold used */
  minSimilarityThreshold: number;
  embeddingCost: {
    inputTokens: number;
    costEstimateCredits: number;
    provider: string;
    model: string;
    endpoint: string;
    durationMs: number;
  };
  /** Duration of DB retrieval queries */
  retrievalDurationMs: number;
}

interface ClusterSearchRow {
  cluster_id: string;
  centroid_text: string | null;
  representative_content_item_id: string | null;
  similarity: number;
}

interface ClusterItemRow {
  content_item_id: string;
  title: string | null;
  body_text: string | null;
  canonical_url: string | null;
  source_type: string;
  published_at: string | null;
  similarity: number;
  manual_summary_json: Record<string, unknown> | null;
  triage_json: Record<string, unknown> | null;
  summary_json: Record<string, unknown> | null;
  feedback_action: string | null;
}

function asVectorLiteral(vector: number[]): string {
  return `[${vector.map((n) => (Number.isFinite(n) ? n : 0)).join(",")}]`;
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}...`;
}

const MIN_SIMILARITY_THRESHOLD = 0.3;

export async function retrieveContext(params: {
  db: Db;
  question: string;
  userId: string;
  topicId: string;
  tier: BudgetTier;
  options?: {
    maxClusters?: number;
    timeWindow?: { from?: string; to?: string };
    /** Conversation ID to optionally exclude from memory retrieval */
    conversationId?: string;
  };
}): Promise<RetrievedContext> {
  const maxClusters = params.options?.maxClusters ?? 5;
  const embeddingsClient = createEnvEmbeddingsClient();

  // 1. Embed the question
  const embedStart = Date.now();
  const ref = embeddingsClient.chooseModel(params.tier);
  const embedResult = await embeddingsClient.embed(ref, [params.question]);
  const embedDurationMs = Date.now() - embedStart;

  const embedding = embedResult.vectors[0];
  if (!embedding || embedding.length === 0) {
    throw new Error("Failed to generate embedding for question");
  }

  // 2. Search clusters by centroid similarity (topic-scoped)
  const retrievalStart = Date.now();

  // Build time window filter (applied to content item timestamps, not cluster updated_at)
  // Use published_at when present, else fall back to fetched_at.
  let itemTimeFilterForExists = "";
  const queryArgs: unknown[] = [
    params.userId,
    params.topicId,
    asVectorLiteral(embedding),
    maxClusters,
  ];

  if (params.options?.timeWindow?.from) {
    queryArgs.push(params.options.timeWindow.from);
    itemTimeFilterForExists += ` and coalesce(ci.published_at, ci.fetched_at) >= $${queryArgs.length}::timestamptz`;
  }
  if (params.options?.timeWindow?.to) {
    queryArgs.push(params.options.timeWindow.to);
    itemTimeFilterForExists += ` and coalesce(ci.published_at, ci.fetched_at) <= $${queryArgs.length}::timestamptz`;
  }

  const clustersRes = await params.db.query<ClusterSearchRow>(
    `select
       c.id::text as cluster_id,
       c.centroid_vector::text as centroid_text,
       c.representative_content_item_id::text as representative_content_item_id,
       (1 - (c.centroid_vector <=> $3::vector))::float8 as similarity
     from clusters c
     where c.user_id = $1::uuid
       and c.centroid_vector is not null
       and exists (
         select 1 from cluster_items cli
         join content_items ci on ci.id = cli.content_item_id
         join content_item_sources cis on cis.content_item_id = cli.content_item_id
         join sources s on s.id = cis.source_id
         where cli.cluster_id = c.id
           and s.topic_id = $2::uuid
           and ci.deleted_at is null
           ${itemTimeFilterForExists}
       )
     order by c.centroid_vector <=> $3::vector asc
     limit $4`,
    queryArgs,
  );

  const clustersSearched = clustersRes.rows.length;
  const similarClusters = clustersRes.rows.filter((r) => r.similarity >= MIN_SIMILARITY_THRESHOLD);

  // 3. For each cluster, fetch top items with their content
  const clustersWithItems: RetrievedCluster[] = [];
  let totalItems = 0;

  for (const cluster of similarClusters) {
    // Apply the same time window when selecting representative items from the cluster.
    const itemArgs: unknown[] = [cluster.cluster_id, params.userId];
    let itemTimeFilter = "";
    if (params.options?.timeWindow?.from) {
      itemArgs.push(params.options.timeWindow.from);
      itemTimeFilter += ` and coalesce(ci.published_at, ci.fetched_at) >= $${itemArgs.length}::timestamptz`;
    }
    if (params.options?.timeWindow?.to) {
      itemArgs.push(params.options.timeWindow.to);
      itemTimeFilter += ` and coalesce(ci.published_at, ci.fetched_at) <= $${itemArgs.length}::timestamptz`;
    }

    const itemsRes = await params.db.query<ClusterItemRow>(
      `select
         ci.id::text as content_item_id,
         ci.title,
         ci.body_text,
         ci.canonical_url,
         ci.source_type,
         ci.published_at::text as published_at,
         cli.similarity,
         cis.summary_json as manual_summary_json,
         latest_digest.triage_json,
         latest_digest.summary_json,
         fb.action as feedback_action
       from cluster_items cli
       join content_items ci on ci.id = cli.content_item_id
       left join content_item_summaries cis
         on cis.user_id = $2::uuid and cis.content_item_id = ci.id
       left join lateral (
         select di.triage_json, di.summary_json
         from digest_items di
         join digests d on d.id = di.digest_id
         where d.user_id = $2::uuid
           and di.content_item_id = ci.id
         order by d.created_at desc
         limit 1
       ) latest_digest on true
       left join lateral (
         select fe.action
         from feedback_events fe
         where fe.user_id = $2::uuid
           and fe.content_item_id = ci.id
         order by fe.created_at desc
         limit 1
       ) fb on true
       where cli.cluster_id = $1::uuid
         and ci.deleted_at is null
         ${itemTimeFilter}
       order by cli.similarity desc
       limit 3`,
      itemArgs,
    );

    const items: RetrievedItem[] = itemsRes.rows.map((item) => ({
      id: item.content_item_id,
      title: item.title ?? "(no title)",
      bodyText: truncate(item.body_text ?? "", 2000),
      manualSummaryJson: item.manual_summary_json ?? null,
      triageJson: item.triage_json ?? null,
      summaryJson: item.summary_json ?? null,
      feedbackAction: item.feedback_action ?? null,
      url: item.canonical_url ?? "",
      sourceType: item.source_type,
      publishedAt: item.published_at ?? "",
      similarity: item.similarity,
    }));

    totalItems += items.length;

    clustersWithItems.push({
      id: cluster.cluster_id,
      summary: "",
      similarity: cluster.similarity,
      items,
    });
  }

  const retrievalDurationMs = Date.now() - retrievalStart;

  return {
    clusters: clustersWithItems,
    totalItems,
    memoryTurns: undefined,
    conversationSummary: null,
    clustersSearched,
    minSimilarityThreshold: MIN_SIMILARITY_THRESHOLD,
    embeddingCost: {
      inputTokens: embedResult.inputTokens,
      costEstimateCredits: embedResult.costEstimateCredits,
      provider: embedResult.provider,
      model: embedResult.model,
      endpoint: embedResult.endpoint,
      durationMs: embedDurationMs,
    },
    retrievalDurationMs,
  };
}
