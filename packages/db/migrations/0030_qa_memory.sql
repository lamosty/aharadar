-- QA memory tables for Ask multi-turn conversations (topic-scoped).
-- Stores conversations and Q/A turns, plus embeddings for semantic retrieval.
--
-- Design goals:
-- - topic-agnostic (no domain assumptions)
-- - provider/model-agnostic (store model used for embeddings)
-- - bounded retrieval (top-K turns) done at query time

CREATE TABLE IF NOT EXISTS qa_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic_id uuid NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  title text,
  summary text,
  summary_updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS qa_conversations_user_topic_updated_idx
  ON qa_conversations(user_id, topic_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS qa_turns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES qa_conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic_id uuid NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  question text NOT NULL,
  answer text NOT NULL,
  citations_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  data_gaps_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS qa_turns_conversation_created_idx
  ON qa_turns(conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS qa_turns_user_topic_created_idx
  ON qa_turns(user_id, topic_id, created_at DESC);

-- Embeddings for semantic retrieval over Q/A turns.
-- Note: we keep dims at 1536 to match current pgvector schema contract.
CREATE TABLE IF NOT EXISTS qa_turn_embeddings (
  qa_turn_id uuid PRIMARY KEY REFERENCES qa_turns(id) ON DELETE CASCADE,
  model text NOT NULL,
  dims int NOT NULL,
  vector vector(1536) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS qa_turn_embeddings_vector_hnsw
  ON qa_turn_embeddings USING hnsw (vector vector_cosine_ops);

