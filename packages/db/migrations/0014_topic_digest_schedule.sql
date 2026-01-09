-- Add topic-level digest schedule and depth settings
-- Per task-120/task-121: explicit per-topic cadence replaces global scheduler config

-- New columns for digest scheduling (IF NOT EXISTS for idempotency)
ALTER TABLE topics ADD COLUMN IF NOT EXISTS digest_schedule_enabled boolean NOT NULL DEFAULT true;
COMMENT ON COLUMN topics.digest_schedule_enabled IS 'Whether scheduled digests are enabled for this topic';

ALTER TABLE topics ADD COLUMN IF NOT EXISTS digest_interval_minutes integer NOT NULL DEFAULT 1440;
COMMENT ON COLUMN topics.digest_interval_minutes IS 'Digest generation interval in minutes (15 min to 30 days)';

ALTER TABLE topics ADD COLUMN IF NOT EXISTS digest_mode text NOT NULL DEFAULT 'normal';
COMMENT ON COLUMN topics.digest_mode IS 'Digest mode affecting size and LLM spend: low, normal, or high';

ALTER TABLE topics ADD COLUMN IF NOT EXISTS digest_depth integer NOT NULL DEFAULT 50;
COMMENT ON COLUMN topics.digest_depth IS 'Depth slider value (0-100) for fine-tuning digest size within mode';

ALTER TABLE topics ADD COLUMN IF NOT EXISTS digest_cursor_end timestamptz;
COMMENT ON COLUMN topics.digest_cursor_end IS 'Scheduler cursor: end of last successfully completed scheduled window';

-- Add constraints (idempotent via DO block)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'topics_digest_interval_minutes_check') THEN
    ALTER TABLE topics ADD CONSTRAINT topics_digest_interval_minutes_check
      CHECK (digest_interval_minutes >= 15 AND digest_interval_minutes <= 43200);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'topics_digest_mode_check') THEN
    ALTER TABLE topics ADD CONSTRAINT topics_digest_mode_check
      CHECK (digest_mode IN ('low', 'normal', 'high'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'topics_digest_depth_check') THEN
    ALTER TABLE topics ADD CONSTRAINT topics_digest_depth_check
      CHECK (digest_depth >= 0 AND digest_depth <= 100);
  END IF;
END $$;

-- Index for scheduler queries (find topics due for digest)
CREATE INDEX IF NOT EXISTS topics_user_digest_cursor_idx ON topics(user_id, digest_cursor_end);

-- Purge legacy catch_up digests (mode is being removed)
-- ON DELETE CASCADE will handle digest_items
DELETE FROM digests WHERE mode = 'catch_up';
