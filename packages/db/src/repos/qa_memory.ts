import type { Queryable } from "../db";

function asVectorLiteral(vector: number[]): string {
  // pgvector accepts '[1,2,3]' string input.
  return `[${vector.map((n) => (Number.isFinite(n) ? n : 0)).join(",")}]`;
}

export interface QaConversationRow {
  id: string;
  user_id: string;
  topic_id: string;
  title: string | null;
  summary: string | null;
  summary_updated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface QaTurnRow {
  id: string;
  conversation_id: string;
  user_id: string;
  topic_id: string;
  question: string;
  answer: string;
  citations_json: unknown;
  confidence_json: unknown;
  data_gaps_json: unknown;
  created_at: string;
}

export interface QaTurnSearchHit {
  id: string;
  conversation_id: string;
  question: string;
  answer: string;
  created_at: string;
  similarity: number;
}

export function createQaMemoryRepo(db: Queryable) {
  return {
    async createConversation(params: {
      userId: string;
      topicId: string;
      title?: string | null;
    }): Promise<{ id: string }> {
      const res = await db.query<{ id: string }>(
        `insert into qa_conversations (user_id, topic_id, title)
         values ($1::uuid, $2::uuid, $3)
         returning id::text`,
        [params.userId, params.topicId, params.title ?? null],
      );
      const row = res.rows[0];
      if (!row) throw new Error("qa.createConversation failed: no row returned");
      return row;
    },

    async getConversation(params: {
      userId: string;
      conversationId: string;
    }): Promise<QaConversationRow | null> {
      const res = await db.query<QaConversationRow>(
        `select
           id::text,
           user_id::text,
           topic_id::text,
           title,
           summary,
           summary_updated_at::text,
           created_at::text,
           updated_at::text
         from qa_conversations
         where id = $1::uuid
           and user_id = $2::uuid
         limit 1`,
        [params.conversationId, params.userId],
      );
      return res.rows[0] ?? null;
    },

    async touchConversation(conversationId: string): Promise<void> {
      await db.query(`update qa_conversations set updated_at = now() where id = $1::uuid`, [
        conversationId,
      ]);
    },

    async insertTurn(params: {
      conversationId: string;
      userId: string;
      topicId: string;
      question: string;
      answer: string;
      citationsJson: unknown;
      confidenceJson: unknown;
      dataGapsJson: unknown;
    }): Promise<{ id: string }> {
      const res = await db.query<{ id: string }>(
        `insert into qa_turns (
           conversation_id, user_id, topic_id,
           question, answer,
           citations_json, confidence_json, data_gaps_json
         ) values (
           $1::uuid, $2::uuid, $3::uuid,
           $4, $5,
           $6::jsonb, $7::jsonb, $8::jsonb
         )
         returning id::text`,
        [
          params.conversationId,
          params.userId,
          params.topicId,
          params.question,
          params.answer,
          JSON.stringify(params.citationsJson ?? []),
          JSON.stringify(params.confidenceJson ?? {}),
          JSON.stringify(params.dataGapsJson ?? []),
        ],
      );
      const row = res.rows[0];
      if (!row) throw new Error("qa.insertTurn failed: no row returned");
      return row;
    },

    async upsertTurnEmbedding(params: {
      qaTurnId: string;
      model: string;
      dims: number;
      vector: number[];
    }): Promise<{ inserted: boolean }> {
      const res = await db.query<{ inserted: boolean }>(
        `insert into qa_turn_embeddings (qa_turn_id, model, dims, vector)
         values ($1::uuid, $2, $3, $4::vector)
         on conflict (qa_turn_id)
         do update set
           model = excluded.model,
           dims = excluded.dims,
           vector = excluded.vector,
           created_at = now()
         returning (xmax = 0) as inserted`,
        [params.qaTurnId, params.model, params.dims, asVectorLiteral(params.vector)],
      );
      const row = res.rows[0];
      if (!row) throw new Error("qa.upsertTurnEmbedding failed: no row returned");
      return row;
    },

    async searchTurnsByEmbedding(params: {
      userId: string;
      topicId: string;
      embedding: number[];
      limit: number;
      /** Optionally exclude a conversation (e.g., current) */
      excludeConversationId?: string;
      /** Optionally only include turns newer than this ISO timestamp */
      since?: string;
    }): Promise<QaTurnSearchHit[]> {
      const limit = Math.max(1, Math.min(50, Math.floor(params.limit)));
      const args: unknown[] = [
        params.userId,
        params.topicId,
        asVectorLiteral(params.embedding),
        limit,
      ];
      let whereExtra = "";

      if (params.excludeConversationId) {
        args.push(params.excludeConversationId);
        whereExtra += ` and t.conversation_id <> $${args.length}::uuid`;
      }
      if (params.since) {
        args.push(params.since);
        whereExtra += ` and t.created_at >= $${args.length}::timestamptz`;
      }

      const res = await db.query<QaTurnSearchHit>(
        `select
           t.id::text as id,
           t.conversation_id::text as conversation_id,
           t.question,
           t.answer,
           t.created_at::text as created_at,
           (1 - (e.vector <=> $3::vector))::float8 as similarity
         from qa_turn_embeddings e
         join qa_turns t on t.id = e.qa_turn_id
         join qa_conversations c on c.id = t.conversation_id
         where t.user_id = $1::uuid
           and t.topic_id = $2::uuid
           and c.user_id = $1::uuid
           and c.topic_id = $2::uuid
           ${whereExtra}
         order by e.vector <=> $3::vector asc
         limit $4`,
        args,
      );
      return res.rows;
    },
  };
}
