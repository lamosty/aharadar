-- Track which scoring mode was used when generating each digest
-- This enables users to compare feed quality across different scoring modes

-- Add scoring_mode_id to digests table
ALTER TABLE digests
  ADD COLUMN IF NOT EXISTS scoring_mode_id UUID REFERENCES scoring_modes(id) ON DELETE SET NULL;

-- Index for querying digests by scoring mode
CREATE INDEX IF NOT EXISTS digests_scoring_mode_idx
  ON digests(scoring_mode_id) WHERE scoring_mode_id IS NOT NULL;
