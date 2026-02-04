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

export interface ThemeLabelOverrideOptions {
  /** Minimum word count for clustered labels (1-4). */
  minLabelWords?: number;
  /** Dominance threshold (0-1). If a label exceeds this share, fall back to raw topics. */
  maxDominancePct?: number;
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

function countWords(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}

function pickClusterLabel(topics: string[]): string {
  if (topics.length === 0) return "Uncategorized";
  let best = topics[0]!;
  let bestWords = countWords(best);
  let bestLength = best.length;

  for (let i = 1; i < topics.length; i += 1) {
    const candidate = topics[i]!;
    const candidateWords = countWords(candidate);
    const candidateLength = candidate.length;
    if (candidateWords > bestWords) {
      best = candidate;
      bestWords = candidateWords;
      bestLength = candidateLength;
      continue;
    }
    if (candidateWords === bestWords && candidateLength > bestLength) {
      best = candidate;
      bestLength = candidateLength;
    }
  }

  return best;
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
 * @param seedClusters - Optional seed clusters (label + vector) to anchor grouping
 * @returns Map of candidateId -> themeLabel
 */
export function clusterTopicsByEmbedding(
  items: Array<{ topic: string; vector: number[] }>,
  threshold = 0.75,
  seedClusters: Array<{ label: string; vector: number[] }> = [],
): { clusters: Cluster[]; topicToLabel: Map<string, string> } {
  const clusters: Cluster[] = [];
  const seenTopics = new Map<string, string>();

  // Initialize clusters from seeds (for theme continuity across digests)
  const seenSeeds = new Set<string>();
  for (const seed of seedClusters) {
    const label = seed.label?.trim();
    if (!label || label === "Uncategorized" || seenSeeds.has(label)) continue;
    if (!Array.isArray(seed.vector) || seed.vector.length === 0) continue;
    clusters.push({
      label,
      topics: [label],
      vectors: [seed.vector],
      centroid: seed.vector,
    });
    seenTopics.set(label, label);
    seenSeeds.add(label);
  }

  for (const item of items) {
    // Skip if we already processed this exact topic string
    if (seenTopics.has(item.topic)) {
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
      seenTopics.set(item.topic, bestCluster.label);
    } else {
      // Create new cluster with this topic as the label
      const newCluster: Cluster = {
        label: item.topic,
        topics: [item.topic],
        vectors: [item.vector],
        centroid: item.vector,
      };
      clusters.push(newCluster);
      seenTopics.set(item.topic, item.topic);
    }
  }

  // Recompute cluster labels to prefer more specific topics (more words/length)
  for (const cluster of clusters) {
    cluster.label = pickClusterLabel(cluster.topics);
  }

  // Rebuild topic -> label map using final cluster labels
  const topicToLabel = new Map<string, string>();
  for (const cluster of clusters) {
    for (const topic of cluster.topics) {
      topicToLabel.set(topic, cluster.label);
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
 * @param seedClusters - Optional seed clusters to stabilize labels across runs
 * @returns Clustered items with theme labels and vectors
 */
export async function clusterTriageThemesIntoLabels(
  items: ThemeClusterInput[],
  tier: BudgetTier,
  threshold?: number,
  seedClusters?: Array<{ label: string; vector: number[] }>,
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
  let client: ReturnType<typeof createEnvEmbeddingsClient>;
  try {
    client = createEnvEmbeddingsClient();
  } catch (err) {
    console.warn(
      `[theme_cluster] embeddings disabled; falling back to raw theme labels: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return {
      items: items.map((item) => ({
        candidateId: item.candidateId,
        topic: item.topic,
        vector: [],
        themeLabel: item.topic || "Uncategorized",
      })),
      clusters: new Map(),
      stats: {
        uniqueTopics: uniqueTopics.length,
        clusterCount: 0,
        inputTokens: 0,
        costEstimateCredits: 0,
      },
    };
  }
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
    seedClusters ?? [],
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

/**
 * Apply post-clustering overrides to reduce theme drift and over-broad labels.
 */
export function applyThemeLabelOverrides(
  result: ThemeClusterResult,
  options?: ThemeLabelOverrideOptions,
): ThemeClusterResult {
  if (!options) return result;

  const minLabelWords = Math.max(1, Math.floor(options.minLabelWords ?? 1));
  const maxDominancePct = options.maxDominancePct ?? 0;

  if (minLabelWords <= 1 && maxDominancePct <= 0) {
    return result;
  }

  const totalItems = result.items.length;
  const labelCounts = new Map<string, number>();

  for (const item of result.items) {
    const label = item.themeLabel;
    if (!label) continue;
    labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
  }

  const dominantLabels = new Set<string>();
  if (maxDominancePct > 0 && totalItems > 0) {
    for (const [label, count] of labelCounts) {
      if (label === "Uncategorized") continue;
      if (count / totalItems >= maxDominancePct) {
        dominantLabels.add(label);
      }
    }
  }

  let changed = false;
  const updatedItems = result.items.map((item) => {
    const rawTopic = item.topic?.trim() ?? "";
    if (!rawTopic || rawTopic === "Uncategorized") {
      return item;
    }

    const label = item.themeLabel ?? rawTopic;
    const labelWords = countWords(label);
    const topicWords = countWords(rawTopic);
    const shouldPreferRaw =
      rawTopic !== label &&
      topicWords >= minLabelWords &&
      (labelWords < minLabelWords || dominantLabels.has(label));

    if (!shouldPreferRaw) {
      return item;
    }

    changed = true;
    return {
      ...item,
      themeLabel: rawTopic,
    };
  });

  if (!changed) return result;

  const clustersMap = new Map<string, string[]>();
  const topicsByLabel = new Map<string, Set<string>>();
  for (const item of updatedItems) {
    const label = item.themeLabel ?? "Uncategorized";
    const existing = topicsByLabel.get(label) ?? new Set<string>();
    existing.add(item.topic);
    topicsByLabel.set(label, existing);
  }

  for (const [label, topics] of topicsByLabel) {
    clustersMap.set(label, [...topics]);
  }

  return {
    ...result,
    items: updatedItems,
    clusters: clustersMap,
    stats: {
      ...result.stats,
      clusterCount: clustersMap.size,
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
