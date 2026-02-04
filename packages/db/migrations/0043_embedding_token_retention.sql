-- Add token-based retention support

ALTER TABLE embeddings
  ADD COLUMN IF NOT EXISTS input_tokens_estimate INTEGER;

ALTER TABLE embedding_retention_runs
  ADD COLUMN IF NOT EXISTS max_tokens INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deleted_by_max_tokens INTEGER NOT NULL DEFAULT 0;
