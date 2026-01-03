import type { Db } from "@aharadar/db";
import { createEnvEmbeddingsClient } from "@aharadar/llm";
import type { BudgetTier, ProviderCallDraft } from "@aharadar/shared";
import { sha256Hex } from "@aharadar/shared";

export interface EmbedLimits {
  maxItems: number;
  batchSize: number;
  maxInputChars: number;
}

export interface EmbedRunResult {
  attempted: number;
  embedded: number;
  updatedHashOnly: number;
  skipped: number;
  errors: number;
  providerCallsOk: number;
  providerCallsError: number;
}

function parseIntEnv(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function clampText(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return value.slice(0, maxChars);
}

function normalizeText(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function buildEmbeddingInput(params: { title: string | null; bodyText: string | null; maxChars: number }): string | null {
  const title = normalizeText(params.title);
  const body = normalizeText(params.bodyText);
  if (!title && !body) return null;

  const combined = title && body ? `${title}\n\n${body}` : title ? title : body!;
  return clampText(combined, params.maxChars);
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  const n = Math.max(1, Math.floor(size));
  for (let i = 0; i < items.length; i += n) out.push(items.slice(i, i + n));
  return out;
}

const EXPECTED_DIMS = 1536;

export interface EmbedTextResult {
  vector: number[];
  inputTokens: number;
  costEstimateCredits: number;
  provider: string;
  model: string;
  endpoint: string;
}

export async function embedText(params: { text: string; tier: BudgetTier }): Promise<EmbedTextResult> {
  const client = createEnvEmbeddingsClient();
  const ref = client.chooseModel(params.tier);
  const call = await client.embed(ref, [params.text]);
  const vector = call.vectors[0];
  if (!vector || vector.length !== EXPECTED_DIMS) {
    throw new Error(`Embedding dims mismatch: got ${vector ? vector.length : 0}, expected ${EXPECTED_DIMS}`);
  }
  for (const n of vector) {
    if (typeof n !== "number" || !Number.isFinite(n)) {
      throw new Error("Embedding contains non-finite number");
    }
  }
  return {
    vector,
    inputTokens: call.inputTokens,
    costEstimateCredits: call.costEstimateCredits,
    provider: call.provider,
    model: call.model,
    endpoint: call.endpoint,
  };
}

export async function embedTopicContentItems(params: {
  db: Db;
  userId: string;
  topicId: string;
  windowStart?: string;
  windowEnd?: string;
  tier: BudgetTier;
  limits?: Partial<EmbedLimits>;
}): Promise<EmbedRunResult> {
  const maxItems = params.limits?.maxItems ?? parseIntEnv(process.env.OPENAI_EMBED_MAX_ITEMS_PER_RUN) ?? 100;
  const batchSize = params.limits?.batchSize ?? parseIntEnv(process.env.OPENAI_EMBED_BATCH_SIZE) ?? 16;
  const maxInputChars = params.limits?.maxInputChars ?? parseIntEnv(process.env.OPENAI_EMBED_MAX_INPUT_CHARS) ?? 8000;

  let client: ReturnType<typeof createEnvEmbeddingsClient> | null = null;
  try {
    client = createEnvEmbeddingsClient();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`Embeddings disabled: ${message}`);
    return {
      attempted: 0,
      embedded: 0,
      updatedHashOnly: 0,
      skipped: 0,
      errors: 0,
      providerCallsOk: 0,
      providerCallsError: 0,
    };
  }

  const ref = client.chooseModel(params.tier);

  const candidates = await params.db.embeddings.listNeedingEmbedding({
    userId: params.userId,
    topicId: params.topicId,
    model: ref.model,
    dims: EXPECTED_DIMS,
    limit: maxItems,
    windowStart: params.windowStart,
    windowEnd: params.windowEnd,
  });

  let attempted = 0;
  let embedded = 0;
  let updatedHashOnly = 0;
  let skipped = 0;
  let errors = 0;
  let providerCallsOk = 0;
  let providerCallsError = 0;

  const toEmbed: Array<{ contentItemId: string; text: string; hashText: string; sourceId: string; sourceType: string }> = [];

  for (const row of candidates) {
    attempted += 1;

    const text = buildEmbeddingInput({ title: row.title, bodyText: row.body_text, maxChars: maxInputChars });
    if (!text) {
      skipped += 1;
      continue;
    }

    const hashText = sha256Hex(text);

    // If we already have an embedding with the target model/dims, we can just backfill hash_text.
    if (row.embedding_model === ref.model && row.embedding_dims === EXPECTED_DIMS && row.hash_text === null) {
      try {
        await params.db.query(`update content_items set hash_text = $2 where id = $1::uuid`, [row.content_item_id, hashText]);
        updatedHashOnly += 1;
      } catch (err) {
        errors += 1;
        console.warn(`content_items hash_text update failed (content_item_id=${row.content_item_id})`, err);
      }
      continue;
    }

    toEmbed.push({
      contentItemId: row.content_item_id,
      text,
      hashText,
      sourceId: row.source_id,
      sourceType: row.source_type,
    });
  }

  for (const batch of chunk(toEmbed, batchSize)) {
    const startedAt = new Date().toISOString();
    const input = batch.map((b) => b.text);
    const contentItemIds = batch.map((b) => b.contentItemId);
    try {
      const call = await client.embed(ref, input);

      if (call.vectors.length !== batch.length) {
        throw new Error(`Embedding provider returned ${call.vectors.length} vectors for ${batch.length} inputs`);
      }

      // Validate dims against the fixed schema contract (vector(1536)).
      for (let i = 0; i < call.vectors.length; i += 1) {
        const vec = call.vectors[i]!;
        if (vec.length !== EXPECTED_DIMS) {
          throw new Error(`Embedding dims mismatch for batch index ${i}: got ${vec.length}, expected ${EXPECTED_DIMS}`);
        }
        for (const n of vec) {
          if (typeof n !== "number" || !Number.isFinite(n)) {
            throw new Error(`Embedding contains non-finite number (batch index ${i})`);
          }
        }
      }

      await params.db.tx(async (tx) => {
        for (let i = 0; i < batch.length; i += 1) {
          const item = batch[i]!;
          const vector = call.vectors[i]!;
          await tx.query(`update content_items set hash_text = $2 where id = $1::uuid`, [item.contentItemId, item.hashText]);
          await tx.embeddings.upsert({
            contentItemId: item.contentItemId,
            model: ref.model,
            dims: EXPECTED_DIMS,
            vector,
          });
        }
      });

      embedded += batch.length;
      providerCallsOk += 1;

      const endedAt = new Date().toISOString();
      const draft: ProviderCallDraft = {
        userId: params.userId,
        purpose: "embedding",
        provider: call.provider,
        model: call.model,
        inputTokens: call.inputTokens,
        outputTokens: 0,
        costEstimateCredits: call.costEstimateCredits,
        meta: {
          topicId: params.topicId,
          windowStart: params.windowStart,
          windowEnd: params.windowEnd,
          endpoint: call.endpoint,
          dims: EXPECTED_DIMS,
          batchSize: batch.length,
          contentItemIds,
          sourceTypes: batch.map((b) => b.sourceType),
          sourceIds: batch.map((b) => b.sourceId),
        },
        startedAt,
        endedAt,
        status: "ok",
      };
      try {
        await params.db.providerCalls.insert(draft);
      } catch (err) {
        console.warn("provider_calls insert failed (embedding)", err);
      }
    } catch (err) {
      providerCallsError += 1;
      errors += batch.length;

      const endedAt = new Date().toISOString();
      const errObj = err && typeof err === "object" ? (err as Record<string, unknown>) : {};

      try {
        const draft: ProviderCallDraft = {
          userId: params.userId,
          purpose: "embedding",
          provider: ref.provider,
          model: ref.model,
          inputTokens: 0,
          outputTokens: 0,
          costEstimateCredits: 0,
          meta: {
            topicId: params.topicId,
            windowStart: params.windowStart,
            windowEnd: params.windowEnd,
            endpoint: ref.endpoint,
            dims: EXPECTED_DIMS,
            batchSize: batch.length,
            contentItemIds,
          },
          startedAt,
          endedAt,
          status: "error",
          error: {
            message: err instanceof Error ? err.message : String(err),
            statusCode: errObj.statusCode,
            responseSnippet: errObj.responseSnippet,
          },
        };
        await params.db.providerCalls.insert(draft);
      } catch (err) {
        console.warn("provider_calls insert failed (embedding error)", err);
      }

      console.warn(
        `embedding failed for batch (${batch.length} items): ${err instanceof Error ? err.message : String(err)}`
      );
      continue;
    }
  }

  return {
    attempted,
    embedded,
    updatedHashOnly,
    skipped,
    errors,
    providerCallsOk,
    providerCallsError,
  };
}

