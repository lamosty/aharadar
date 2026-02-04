import type { Db } from "@aharadar/db";
import { createLogger, parseEmbeddingRetention } from "@aharadar/shared";

import { getNoveltyLookbackDays } from "../scoring/novelty";

const log = createLogger({ component: "embedding_retention" });

export interface EmbeddingRetentionResult {
  enabled: boolean;
  maxAgeDays: number;
  maxItems: number;
  effectiveMaxAgeDays: number;
  cutoffIso: string;
  deletedByAge: number;
  deletedByMaxItems: number;
  totalDeleted: number;
}

export async function pruneEmbeddingsForTopic(params: {
  db: Db;
  userId: string;
  topicId: string;
  windowEnd: string;
  customSettings?: Record<string, unknown> | null;
}): Promise<EmbeddingRetentionResult | null> {
  const retention = parseEmbeddingRetention(params.customSettings?.embedding_retention_v1);
  if (!retention.enabled) {
    log.info({ topicId: params.topicId.slice(0, 8) }, "Embedding retention disabled");
    return null;
  }

  const noveltyLookbackDays = getNoveltyLookbackDays();
  const effectiveMaxAgeDays = Math.max(retention.maxAgeDays, noveltyLookbackDays);

  const windowEndMs = Date.parse(params.windowEnd);
  const baseMs = Number.isFinite(windowEndMs) ? windowEndMs : Date.now();
  const cutoffIso = new Date(baseMs - effectiveMaxAgeDays * 24 * 60 * 60 * 1000).toISOString();

  const result = await params.db.embeddings.pruneForTopic({
    userId: params.userId,
    topicId: params.topicId,
    cutoffIso,
    maxItems: retention.maxItems,
    protectFeedback: retention.protectFeedback,
    protectBookmarks: retention.protectBookmarks,
  });

  try {
    await params.db.embeddingRetentionRuns.insert({
      userId: params.userId,
      topicId: params.topicId,
      windowEnd: params.windowEnd,
      maxAgeDays: retention.maxAgeDays,
      maxItems: retention.maxItems,
      effectiveMaxAgeDays,
      cutoffIso,
      deletedByAge: result.deletedByAge,
      deletedByMaxItems: result.deletedByMaxItems,
      totalDeleted: result.totalDeleted,
    });
  } catch (err) {
    log.warn({ err }, "Failed to store embedding retention run");
  }

  log.info(
    {
      topicId: params.topicId.slice(0, 8),
      maxAgeDays: retention.maxAgeDays,
      maxItems: retention.maxItems,
      effectiveMaxAgeDays,
      deletedByAge: result.deletedByAge,
      deletedByMaxItems: result.deletedByMaxItems,
      totalDeleted: result.totalDeleted,
    },
    "Embedding retention completed",
  );

  return {
    enabled: retention.enabled,
    maxAgeDays: retention.maxAgeDays,
    maxItems: retention.maxItems,
    effectiveMaxAgeDays,
    cutoffIso,
    deletedByAge: result.deletedByAge,
    deletedByMaxItems: result.deletedByMaxItems,
    totalDeleted: result.totalDeleted,
  };
}
