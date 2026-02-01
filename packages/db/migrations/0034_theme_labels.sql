-- Theme labels: Store embedding-based theme clustering results on digest_items
--
-- Problem: Items end up "Uncategorized" because:
-- 1. LLM generates specific triage topics ("Bitcoin DCA", "Bitcoin advice")
-- 2. Client groups by exact string match - each topic has only 1 item
-- 3. Items with 1-item topics all go to "Uncategorized"
--
-- Solution: Embed short triage topic strings and cluster by similarity.
-- "Bitcoin DCA" ↔ "Bitcoin advice" → high similarity → same theme_label

-- Store the embedding of the triage topic (for potential re-clustering)
ALTER TABLE digest_items ADD COLUMN IF NOT EXISTS triage_theme_vector vector(1536);

-- Store the theme label (result of clustering - representative topic string)
ALTER TABLE digest_items ADD COLUMN IF NOT EXISTS theme_label TEXT;

-- Index for efficient similarity search (useful for admin regenerate)
-- Using ivfflat for balance of build speed and query performance
CREATE INDEX IF NOT EXISTS idx_digest_items_triage_theme_vector ON digest_items
  USING ivfflat (triage_theme_vector vector_cosine_ops) WITH (lists = 100);

-- Index for filtering by theme_label
CREATE INDEX IF NOT EXISTS idx_digest_items_theme_label ON digest_items (theme_label)
  WHERE theme_label IS NOT NULL;
