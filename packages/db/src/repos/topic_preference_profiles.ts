import type { Queryable } from "../db";

export interface TopicPreferenceProfileRow {
  user_id: string;
  topic_id: string;
  positive_count: number;
  negative_count: number;
  positive_vector_text: string | null;
  negative_vector_text: string | null;
  updated_at: string;
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

function meanUpdate(
  existing: number[] | null,
  count: number,
  next: number[]
): { vector: number[]; count: number } {
  const n = Math.max(0, Math.floor(count));
  if (!existing || existing.length === 0 || n === 0) {
    return { vector: next, count: n + 1 };
  }
  if (existing.length !== next.length) {
    // If dims ever change, prefer the new vector rather than blending incompatible dims.
    return { vector: next, count: n + 1 };
  }
  const out: number[] = new Array(existing.length);
  const denom = n + 1;
  for (let i = 0; i < existing.length; i += 1) {
    out[i] = (existing[i]! * n + next[i]!) / denom;
  }
  return { vector: out, count: denom };
}

export function createTopicPreferenceProfilesRepo(db: Queryable) {
  return {
    async getByUserAndTopic(params: {
      userId: string;
      topicId: string;
    }): Promise<TopicPreferenceProfileRow | null> {
      const res = await db.query<TopicPreferenceProfileRow>(
        `select
           user_id::text as user_id,
           topic_id::text as topic_id,
           positive_count,
           negative_count,
           positive_vector::text as positive_vector_text,
           negative_vector::text as negative_vector_text,
           updated_at::text as updated_at
         from topic_preference_profiles
         where user_id = $1::uuid and topic_id = $2::uuid`,
        [params.userId, params.topicId]
      );
      return res.rows[0] ?? null;
    },

    async getOrCreate(params: { userId: string; topicId: string }): Promise<void> {
      await db.query(
        `insert into topic_preference_profiles (user_id, topic_id)
         values ($1::uuid, $2::uuid)
         on conflict (user_id, topic_id) do nothing`,
        [params.userId, params.topicId]
      );
    },

    async applyFeedbackEmbedding(params: {
      userId: string;
      topicId: string;
      action: "like" | "save" | "dislike";
      embeddingVector: number[];
    }): Promise<{ positiveCount: number; negativeCount: number }> {
      // We do a read-modify-write so we don't rely on pgvector arithmetic operators.
      await this.getOrCreate({ userId: params.userId, topicId: params.topicId });
      const current = await this.getByUserAndTopic({ userId: params.userId, topicId: params.topicId });
      if (!current) throw new Error("topic_preference_profiles missing after getOrCreate");

      const posVec = current.positive_vector_text ? parseVectorText(current.positive_vector_text) : null;
      const negVec = current.negative_vector_text ? parseVectorText(current.negative_vector_text) : null;

      let nextPos = posVec;
      let nextNeg = negVec;
      let posCount = current.positive_count;
      let negCount = current.negative_count;

      if (params.action === "like" || params.action === "save") {
        const upd = meanUpdate(posVec, posCount, params.embeddingVector);
        nextPos = upd.vector;
        posCount = upd.count;
      } else {
        const upd = meanUpdate(negVec, negCount, params.embeddingVector);
        nextNeg = upd.vector;
        negCount = upd.count;
      }

      await db.query(
        `update topic_preference_profiles
         set
           positive_count = $3,
           negative_count = $4,
           positive_vector = $5::vector,
           negative_vector = $6::vector,
           updated_at = now()
         where user_id = $1::uuid and topic_id = $2::uuid`,
        [
          params.userId,
          params.topicId,
          posCount,
          negCount,
          nextPos ? asVectorLiteral(nextPos) : null,
          nextNeg ? asVectorLiteral(nextNeg) : null,
        ]
      );

      return { positiveCount: posCount, negativeCount: negCount };
    },
  };
}
