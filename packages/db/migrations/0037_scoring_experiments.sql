-- Scoring Experiments: Track experiment sessions for scoring mode testing
--
-- Purpose: Enable systematic testing of different scoring modes with
-- automatic metric gathering and user observations.

-- ============================================================================
-- scoring_experiments: Experiment sessions for A/B testing scoring modes
-- ============================================================================
CREATE TABLE IF NOT EXISTS scoring_experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  mode_id UUID NOT NULL REFERENCES scoring_modes(id) ON DELETE SET NULL,

  -- Experiment metadata
  name TEXT NOT NULL,              -- Short name for the experiment
  hypothesis TEXT,                 -- What we're testing / expecting
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,            -- NULL = still running

  -- Auto-gathered metrics during experiment period
  items_shown INT NOT NULL DEFAULT 0,
  items_liked INT NOT NULL DEFAULT 0,
  items_disliked INT NOT NULL DEFAULT 0,
  items_skipped INT NOT NULL DEFAULT 0,
  digests_generated INT NOT NULL DEFAULT 0,

  -- User observations
  notes TEXT,                      -- Running notes during experiment
  outcome TEXT,                    -- 'positive' | 'neutral' | 'negative' | null
  learnings TEXT,                  -- What we learned after ending

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for finding experiments by user and topic
CREATE INDEX IF NOT EXISTS scoring_experiments_user_topic_idx
  ON scoring_experiments(user_id, topic_id, started_at DESC);

-- Index for finding active experiments
CREATE INDEX IF NOT EXISTS scoring_experiments_active_idx
  ON scoring_experiments(user_id, topic_id)
  WHERE ended_at IS NULL;

-- ============================================================================
-- Add experiment_notes to scoring_modes for long-form learnings
-- ============================================================================
-- Note: 'notes' column already exists from migration 0036, so this is optional
-- but we ensure it exists for completeness
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scoring_modes' AND column_name = 'notes'
  ) THEN
    ALTER TABLE scoring_modes ADD COLUMN notes TEXT;
  END IF;
END $$;
