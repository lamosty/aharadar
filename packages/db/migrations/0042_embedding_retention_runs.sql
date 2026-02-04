-- Embedding retention runs: track pruning activity per topic

CREATE TABLE IF NOT EXISTS embedding_retention_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  window_end TIMESTAMPTZ NOT NULL,
  max_age_days INTEGER NOT NULL,
  max_items INTEGER NOT NULL DEFAULT 0,
  effective_max_age_days INTEGER NOT NULL,
  cutoff_at TIMESTAMPTZ NOT NULL,
  deleted_by_age INTEGER NOT NULL DEFAULT 0,
  deleted_by_max_items INTEGER NOT NULL DEFAULT 0,
  total_deleted INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX embedding_retention_runs_topic_created_idx
  ON embedding_retention_runs(user_id, topic_id, created_at DESC);
