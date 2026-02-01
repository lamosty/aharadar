/**
 * Theme Clustering: Group triage topics by embedding similarity
 *
 * Problem: LLM generates specific triage topics ("Bitcoin DCA", "Bitcoin advice")
 * but these need to be grouped for UI display.
 *
 * Solution: Embed the short triage topic strings and cluster by cosine similarity.
 * Similar topics get the same theme_label (the first/representative topic in the cluster).
 */

import { createEnvEmbeddingsClient } from "@aharadar/llm";
import type { BudgetTier } from "@aharadar/shared";

export interface ThemeClusterInput {
  candidateId: string;
  topic: string;
}

export interface ThemeClusterOutput {
  candidateId: string;
  topic: string;
  vector: number[];
  themeLabel: string;
}

export interface ThemeClusterResult {
  items: ThemeClusterOutput[];
  clusters: Map<string, string[]>; // themeLabel -> [topics in cluster]
  stats: {
    uniqueTopics: number;
    clusterCount: number;
    inputTokens: number;
    costEstimateCredits: number;
  };
}

/**
 * Cosine similarity between two vectors.
 * Returns value in [-1, 1], where 1 = identical direction.
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    dot += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 0 ? dot / denom : 0;
}

/**
 * Compute centroid (average) of multiple vectors.
 */
function computeCentroid(vectors: number[][]): number[] {
  if (vectors.length === 0) return [];
  const dims = vectors[0]?.length ?? 0;
  const centroid = new Array(dims).fill(0) as number[];

  for (const vec of vectors) {
    for (let i = 0; i < dims; i++) {
      centroid[i] += vec[i] ?? 0;
    }
  }

  for (let i = 0; i < dims; i++) {
    centroid[i] /= vectors.length;
  }

  return centroid;
}

interface Cluster {
  label: string;
  topics: string[];
  vectors: number[][];
  centroid: number[];
}

/**
 * Greedy clustering of topics by embedding similarity.
 *
 * Algorithm:
 * 1. For each topic, find the most similar existing cluster centroid
 * 2. If similarity >= threshold, add to that cluster and update centroid
 * 3. Otherwise, create a new cluster with this topic as the label
 *
 * @param items - Items with topic strings and their embeddings
 * @param threshold - Minimum cosine similarity to join a cluster (default 0.75)
 * @returns Map of candidateId -> themeLabel
 */
export function clusterTopicsByEmbedding(
  items: Array<{ topic: string; vector: number[] }>,
  threshold = 0.75,
): { clusters: Cluster[]; topicToLabel: Map<string, string> } {
  const clusters: Cluster[] = [];
  const topicToLabel = new Map<string, string>();

  for (const item of items) {
    // Skip if we already processed this exact topic string
    if (topicToLabel.has(item.topic)) {
      continue;
    }

    // Find best matching cluster
    let bestCluster: Cluster | null = null;
    let bestSimilarity = threshold;

    for (const cluster of clusters) {
      const similarity = cosineSimilarity(item.vector, cluster.centroid);
      if (similarity > bestSimilarity) {
        bestCluster = cluster;
        bestSimilarity = similarity;
      }
    }

    if (bestCluster) {
      // Add to existing cluster
      bestCluster.topics.push(item.topic);
      bestCluster.vectors.push(item.vector);
      // Update centroid (incremental average)
      bestCluster.centroid = computeCentroid(bestCluster.vectors);
      topicToLabel.set(item.topic, bestCluster.label);
    } else {
      // Create new cluster with this topic as the label
      const newCluster: Cluster = {
        label: item.topic,
        topics: [item.topic],
        vectors: [item.vector],
        centroid: item.vector,
      };
      clusters.push(newCluster);
      topicToLabel.set(item.topic, item.topic);
    }
  }

  return { clusters, topicToLabel };
}

/**
 * Cluster triage topics into theme labels using embedding similarity.
 *
 * This is the main entry point for the digest pipeline.
 * It embeds unique topic strings and clusters them into theme groups.
 *
 * @param items - Items with candidateId and triage topic
 * @param tier - Budget tier for embedding model selection
 * @param threshold - Similarity threshold for clustering (default from env or 0.75)
 * @returns Clustered items with theme labels and vectors
 */
export async function clusterTriageThemesIntoLabels(
  items: ThemeClusterInput[],
  tier: BudgetTier,
  threshold?: number,
): Promise<ThemeClusterResult> {
  // Filter out empty/uncategorized topics
  const validItems = items.filter(
    (item) => item.topic && item.topic !== "Uncategorized" && item.topic.trim().length > 0,
  );

  if (validItems.length === 0) {
    return {
      items: items.map((item) => ({
        candidateId: item.candidateId,
        topic: item.topic,
        vector: [],
        themeLabel: item.topic || "Uncategorized",
      })),
      clusters: new Map(),
      stats: {
        uniqueTopics: 0,
        clusterCount: 0,
        inputTokens: 0,
        costEstimateCredits: 0,
      },
    };
  }

  // Collect unique topics for embedding
  const uniqueTopics = [...new Set(validItems.map((item) => item.topic))];

  // Embed topics using the embeddings client
  const client = createEnvEmbeddingsClient();
  const ref = client.chooseModel(tier);
  const embedResult = await client.embed(ref, uniqueTopics);

  // Build topic -> vector map
  const topicVectors = new Map<string, number[]>();
  for (let i = 0; i < uniqueTopics.length; i++) {
    const topic = uniqueTopics[i]!;
    const vector = embedResult.vectors[i];
    if (vector) {
      topicVectors.set(topic, vector);
    }
  }

  // Cluster topics by embedding similarity
  const effectiveThreshold =
    threshold ?? parseFloatEnv(process.env.THEME_CLUSTER_THRESHOLD) ?? 0.75;

  const topicsWithVectors = uniqueTopics
    .filter((t) => topicVectors.has(t))
    .map((t) => ({ topic: t, vector: topicVectors.get(t)! }));

  const { clusters, topicToLabel } = clusterTopicsByEmbedding(
    topicsWithVectors,
    effectiveThreshold,
  );

  // Build result
  const resultItems: ThemeClusterOutput[] = items.map((item) => {
    const vector = topicVectors.get(item.topic) ?? [];
    const themeLabel =
      item.topic && item.topic !== "Uncategorized"
        ? (topicToLabel.get(item.topic) ?? item.topic)
        : "Uncategorized";
    return {
      candidateId: item.candidateId,
      topic: item.topic,
      vector,
      themeLabel,
    };
  });

  // Build clusters map for stats
  const clustersMap = new Map<string, string[]>();
  for (const cluster of clusters) {
    clustersMap.set(cluster.label, cluster.topics);
  }

  return {
    items: resultItems,
    clusters: clustersMap,
    stats: {
      uniqueTopics: uniqueTopics.length,
      clusterCount: clusters.length,
      inputTokens: embedResult.inputTokens,
      costEstimateCredits: embedResult.costEstimateCredits,
    },
  };
}

function parseFloatEnv(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Cluster items that already have vectors (for admin regeneration).
 * Skips the embedding step and just performs clustering.
 */
export function clusterItemsWithExistingVectors(
  items: Array<{ candidateId: string; topic: string; vector: number[] }>,
  threshold?: number,
): Map<string, string> {
  const effectiveThreshold =
    threshold ?? parseFloatEnv(process.env.THEME_CLUSTER_THRESHOLD) ?? 0.75;

  const validItems = items.filter(
    (item) =>
      item.topic &&
      item.topic !== "Uncategorized" &&
      item.topic.trim().length > 0 &&
      item.vector.length > 0,
  );

  if (validItems.length === 0) {
    return new Map();
  }

  const { topicToLabel } = clusterTopicsByEmbedding(
    validItems.map((i) => ({ topic: i.topic, vector: i.vector })),
    effectiveThreshold,
  );

  // Build candidateId -> themeLabel map
  const result = new Map<string, string>();
  for (const item of items) {
    if (item.topic && item.topic !== "Uncategorized") {
      result.set(item.candidateId, topicToLabel.get(item.topic) ?? item.topic);
    } else {
      result.set(item.candidateId, "Uncategorized");
    }
  }

  return result;
}
