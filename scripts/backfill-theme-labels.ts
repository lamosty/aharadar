/**
 * Backfill theme_label for existing digest items.
 *
 * This script:
 * 1. Finds inbox items (no feedback) for a specific topic
 * 2. Extracts triage themes from triageJson
 * 3. Embeds unique themes
 * 4. Clusters by similarity
 * 5. Updates theme_label in digest_items
 *
 * Usage: npx tsx scripts/backfill-theme-labels.ts
 */

import { loadDotEnvIfPresent } from "@aharadar/shared";

loadDotEnvIfPresent();

import { createDb } from "@aharadar/db";
import { createEnvEmbeddingsClient } from "@aharadar/llm";

const TOPIC_NAME = "Investing & Finances";
const SIMILARITY_THRESHOLD = 0.75;

interface DigestItemRow {
  digest_id: string;
  rank: number;
  content_item_id: string;
  triage_json: { theme?: string; topic?: string } | null;
}

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

function clusterTopics(
  items: Array<{ topic: string; vector: number[] }>,
  threshold: number,
): Map<string, string> {
  const clusters: Cluster[] = [];
  const topicToLabel = new Map<string, string>();

  for (const item of items) {
    if (topicToLabel.has(item.topic)) continue;

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
      bestCluster.topics.push(item.topic);
      bestCluster.vectors.push(item.vector);
      bestCluster.centroid = computeCentroid(bestCluster.vectors);
      topicToLabel.set(item.topic, bestCluster.label);
    } else {
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

  console.log(`\nClusters created: ${clusters.length}`);
  for (const cluster of clusters) {
    if (cluster.topics.length > 1) {
      console.log(`  "${cluster.label}" <- [${cluster.topics.join(", ")}]`);
    }
  }

  return topicToLabel;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }
  const db = createDb(databaseUrl);

  try {
    // 1. Find the topic
    const topicResult = await db.query<{ id: string; user_id: string }>(
      `SELECT id, user_id FROM topics WHERE name = $1 LIMIT 1`,
      [TOPIC_NAME],
    );

    if (topicResult.rows.length === 0) {
      console.error(`Topic "${TOPIC_NAME}" not found`);
      process.exit(1);
    }

    const { id: topicId, user_id: userId } = topicResult.rows[0]!;
    console.log(`Topic: ${TOPIC_NAME} (${topicId})`);

    // 2. Get inbox items (no feedback) with triage_json
    const itemsResult = await db.query<DigestItemRow>(
      `
      WITH latest_items AS (
        SELECT DISTINCT ON (COALESCE(di.content_item_id, c.representative_content_item_id))
          di.digest_id,
          di.rank,
          COALESCE(di.content_item_id, c.representative_content_item_id) as content_item_id,
          di.triage_json
        FROM digest_items di
        JOIN digests d ON d.id = di.digest_id
        LEFT JOIN clusters c ON c.id = di.cluster_id
        WHERE d.topic_id = $1
          AND d.user_id = $2
          AND di.triage_json IS NOT NULL
        ORDER BY COALESCE(di.content_item_id, c.representative_content_item_id), d.created_at DESC
      )
      SELECT li.*
      FROM latest_items li
      LEFT JOIN feedback_events fe ON fe.user_id = $2 AND fe.content_item_id = li.content_item_id
      WHERE fe.action IS NULL
      `,
      [topicId, userId],
    );

    console.log(`Found ${itemsResult.rows.length} inbox items with triage_json`);

    if (itemsResult.rows.length === 0) {
      console.log("No items to update");
      process.exit(0);
    }

    // 3. Extract unique themes
    const itemThemes: Array<{ digestId: string; rank: number; theme: string }> = [];
    const uniqueThemes = new Set<string>();

    for (const row of itemsResult.rows) {
      const theme = row.triage_json?.theme ?? row.triage_json?.topic ?? "Uncategorized";
      if (theme && theme !== "Uncategorized") {
        itemThemes.push({ digestId: row.digest_id, rank: row.rank, theme });
        uniqueThemes.add(theme);
      }
    }

    console.log(`Unique themes: ${uniqueThemes.size}`);
    console.log(
      `Themes: ${[...uniqueThemes].slice(0, 20).join(", ")}${uniqueThemes.size > 20 ? "..." : ""}`,
    );

    if (uniqueThemes.size === 0) {
      console.log("No themes to cluster");
      process.exit(0);
    }

    // 4. Embed themes
    console.log("\nEmbedding themes...");
    const client = createEnvEmbeddingsClient();
    const ref = client.chooseModel("normal");
    const themesArray = [...uniqueThemes];
    const embedResult = await client.embed(ref, themesArray);

    console.log(`Embedded ${themesArray.length} themes (${embedResult.inputTokens} tokens)`);

    // Build theme -> vector map
    const themeVectors = new Map<string, number[]>();
    for (let i = 0; i < themesArray.length; i++) {
      const theme = themesArray[i]!;
      const vector = embedResult.vectors[i];
      if (vector) {
        themeVectors.set(theme, vector);
      }
    }

    // 5. Cluster themes
    console.log(`\nClustering with threshold ${SIMILARITY_THRESHOLD}...`);
    const topicsWithVectors = themesArray
      .filter((t) => themeVectors.has(t))
      .map((t) => ({ topic: t, vector: themeVectors.get(t)! }));

    const topicToLabel = clusterTopics(topicsWithVectors, SIMILARITY_THRESHOLD);

    // 6. Update digest_items
    console.log("\nUpdating digest_items...");
    let updated = 0;

    for (const item of itemThemes) {
      const themeLabel = topicToLabel.get(item.theme) ?? item.theme;
      const vector = themeVectors.get(item.theme);

      await db.query(
        `UPDATE digest_items SET theme_label = $1, triage_theme_vector = $2::vector WHERE digest_id = $3 AND rank = $4`,
        [themeLabel, vector ? `[${vector.join(",")}]` : null, item.digestId, item.rank],
      );
      updated++;
    }

    console.log(`Updated ${updated} items`);

    // 7. Show summary
    const summaryResult = await db.query<{ theme_label: string; count: number }>(
      `
      SELECT theme_label, COUNT(*)::int as count
      FROM digest_items di
      JOIN digests d ON d.id = di.digest_id
      WHERE d.topic_id = $1 AND theme_label IS NOT NULL
      GROUP BY theme_label
      ORDER BY count DESC
      `,
      [topicId],
    );

    console.log("\nTheme label distribution:");
    for (const row of summaryResult.rows) {
      console.log(`  ${row.theme_label}: ${row.count}`);
    }
  } catch (err) {
    console.error(err);
    process.exit(1);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
