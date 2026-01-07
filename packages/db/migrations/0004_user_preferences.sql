-- Migration: User viewing preferences
-- Allows users to configure their viewing profile (power/daily/weekly/research)

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  viewing_profile TEXT NOT NULL DEFAULT 'daily'
    CHECK (viewing_profile IN ('power', 'daily', 'weekly', 'research', 'custom')),
  decay_hours INTEGER NOT NULL DEFAULT 24
    CHECK (decay_hours > 0 AND decay_hours <= 720), -- max 30 days
  last_checked_at TIMESTAMPTZ,
  custom_settings JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS user_preferences_updated_idx ON user_preferences(updated_at);

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_user_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS user_preferences_updated_at_trigger ON user_preferences;
CREATE TRIGGER user_preferences_updated_at_trigger
  BEFORE UPDATE ON user_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_user_preferences_updated_at();

-- Comment on table
COMMENT ON TABLE user_preferences IS 'User viewing preferences for feed display and time decay';
COMMENT ON COLUMN user_preferences.viewing_profile IS 'Preset profile: power (4h), daily (24h), weekly (168h), research (720h), custom';
COMMENT ON COLUMN user_preferences.decay_hours IS 'Hours for exponential decay half-life (used when profile=custom or for fine-tuning)';
COMMENT ON COLUMN user_preferences.last_checked_at IS 'When user last marked feed as "caught up" - items after this are marked NEW';
