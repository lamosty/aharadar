-- Task 125: Digest Observability and Atomicity
-- Adds status tracking, credit usage, and per-source results to digests

-- Digest run status: 'complete' (all sources succeeded) or 'failed' (source skipped)
ALTER TABLE digests ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'complete';

-- Total credits (USD) used for this digest run
ALTER TABLE digests ADD COLUMN IF NOT EXISTS credits_used NUMERIC(12,6) NOT NULL DEFAULT 0;

-- Per-source results: array of { sourceId, sourceName, sourceType, status, skipReason?, itemsFetched }
ALTER TABLE digests ADD COLUMN IF NOT EXISTS source_results JSONB NOT NULL DEFAULT '[]';

-- Error message if status='failed'
ALTER TABLE digests ADD COLUMN IF NOT EXISTS error_message TEXT;

-- Index for filtering/querying by status
CREATE INDEX IF NOT EXISTS digests_status_idx ON digests(status);
