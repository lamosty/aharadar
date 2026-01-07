-- Migration: Move viewing profile settings to topics table
-- Allows each topic to have its own check frequency instead of user-level setting.
-- Keeps user_preferences as a template for new topics.

-- Add viewing profile columns to topics (nullable - inherit from user_preferences if null)
ALTER TABLE topics
  ADD COLUMN IF NOT EXISTS viewing_profile TEXT
    CHECK (viewing_profile IS NULL OR viewing_profile IN ('power', 'daily', 'weekly', 'research', 'custom')),
  ADD COLUMN IF NOT EXISTS decay_hours INTEGER
    CHECK (decay_hours IS NULL OR (decay_hours > 0 AND decay_hours <= 720)),
  ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMPTZ;

-- Copy existing user preferences to their topics
UPDATE topics t
SET
  viewing_profile = up.viewing_profile,
  decay_hours = up.decay_hours,
  last_checked_at = up.last_checked_at
FROM user_preferences up
WHERE t.user_id = up.user_id;

-- Index for efficient "what topics need checking" queries
CREATE INDEX IF NOT EXISTS topics_user_last_checked_idx
  ON topics(user_id, last_checked_at);

-- Comments
COMMENT ON COLUMN topics.viewing_profile IS 'Preset profile: power (4h), daily (24h), weekly (168h), research (720h), custom - NULL inherits from user_preferences';
COMMENT ON COLUMN topics.decay_hours IS 'Hours for exponential decay half-life - NULL inherits from profile default';
COMMENT ON COLUMN topics.last_checked_at IS 'When user last marked this topic as "caught up" - items after this are marked NEW';
