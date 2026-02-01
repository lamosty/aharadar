-- Scoring Modes Framework
-- Configurable ranking strategies with per-source calibration and audit trail

-- ============================================================================
-- scoring_modes: Named scoring strategies with configurable weights/features
-- ============================================================================
CREATE TABLE IF NOT EXISTS scoring_modes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  config_json JSONB NOT NULL DEFAULT '{}',
  notes TEXT,  -- reasoning, observations, experiment learnings
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, name)
);

CREATE INDEX IF NOT EXISTS scoring_modes_user_idx
  ON scoring_modes(user_id);

CREATE INDEX IF NOT EXISTS scoring_modes_user_default_idx
  ON scoring_modes(user_id) WHERE is_default = TRUE;

-- ============================================================================
-- source_calibrations: Per-source feedback tracking for calibration
-- ============================================================================
CREATE TABLE IF NOT EXISTS source_calibrations (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  items_shown INT NOT NULL DEFAULT 0,
  items_liked INT NOT NULL DEFAULT 0,
  items_disliked INT NOT NULL DEFAULT 0,
  rolling_hit_rate REAL,  -- likes / (likes + dislikes) over rolling window
  calibration_offset REAL DEFAULT 0,  -- adjustment to AI score [-1, 1]
  window_start TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, source_id)
);

CREATE INDEX IF NOT EXISTS source_calibrations_user_idx
  ON source_calibrations(user_id);

-- ============================================================================
-- scoring_mode_changes: Audit log for mode changes with observations
-- ============================================================================
CREATE TABLE IF NOT EXISTS scoring_mode_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic_id UUID REFERENCES topics(id) ON DELETE CASCADE,  -- null = global/default change
  previous_mode_id UUID REFERENCES scoring_modes(id) ON DELETE SET NULL,
  new_mode_id UUID REFERENCES scoring_modes(id) ON DELETE SET NULL,
  reason TEXT,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS scoring_mode_changes_user_idx
  ON scoring_mode_changes(user_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS scoring_mode_changes_topic_idx
  ON scoring_mode_changes(topic_id, changed_at DESC);

-- ============================================================================
-- Add scoring_mode_id to topics for per-topic mode selection
-- ============================================================================
ALTER TABLE topics
  ADD COLUMN IF NOT EXISTS scoring_mode_id UUID REFERENCES scoring_modes(id) ON DELETE SET NULL;

-- ============================================================================
-- Extend topic_preference_profiles for AI preference injection
-- ============================================================================
ALTER TABLE topic_preference_profiles
  ADD COLUMN IF NOT EXISTS natural_language_prefs TEXT,
  ADD COLUMN IF NOT EXISTS prefs_generated_at TIMESTAMPTZ;

-- ============================================================================
-- Seed default scoring modes for existing users
-- These are inserted only if the user has no modes yet
-- ============================================================================

-- Function to seed default modes for a user
CREATE OR REPLACE FUNCTION seed_default_scoring_modes(p_user_id UUID)
RETURNS void AS $$
BEGIN
  -- Skip if user already has modes
  IF EXISTS (SELECT 1 FROM scoring_modes WHERE user_id = p_user_id) THEN
    RETURN;
  END IF;

  -- Mode 1: Balanced (current default behavior)
  INSERT INTO scoring_modes (user_id, name, description, config_json, is_default, notes)
  VALUES (
    p_user_id,
    'Balanced',
    'Default scoring with AI-heavy ranking',
    '{
      "version": 1,
      "weights": {
        "wAha": 0.8,
        "wHeuristic": 0.15,
        "wPref": 0.15,
        "wNovelty": 0.05
      },
      "features": {
        "perSourceCalibration": false,
        "aiPreferenceInjection": false,
        "embeddingPreferences": true
      },
      "calibration": {
        "windowDays": 30,
        "minSamples": 10,
        "maxOffset": 0.2
      }
    }'::jsonb,
    TRUE,
    'Standard scoring mode - AI triage dominates with preference embedding support'
  );

  -- Mode 2: Preference-Heavy
  INSERT INTO scoring_modes (user_id, name, description, config_json, notes)
  VALUES (
    p_user_id,
    'Preference-Heavy',
    'Higher weight on user preferences with source calibration',
    '{
      "version": 1,
      "weights": {
        "wAha": 0.6,
        "wHeuristic": 0.1,
        "wPref": 0.25,
        "wNovelty": 0.05
      },
      "features": {
        "perSourceCalibration": true,
        "aiPreferenceInjection": false,
        "embeddingPreferences": true
      },
      "calibration": {
        "windowDays": 30,
        "minSamples": 10,
        "maxOffset": 0.2
      }
    }'::jsonb,
    'Use when you have strong preferences and want them to influence ranking more'
  );

  -- Mode 3: AI + Calibration
  INSERT INTO scoring_modes (user_id, name, description, config_json, notes)
  VALUES (
    p_user_id,
    'AI + Calibration',
    'AI-focused with per-source learning and preference injection',
    '{
      "version": 1,
      "weights": {
        "wAha": 0.7,
        "wHeuristic": 0.1,
        "wPref": 0.1,
        "wNovelty": 0.05
      },
      "features": {
        "perSourceCalibration": true,
        "aiPreferenceInjection": true,
        "embeddingPreferences": false
      },
      "calibration": {
        "windowDays": 30,
        "minSamples": 10,
        "maxOffset": 0.2
      }
    }'::jsonb,
    'Experimental - uses natural language preferences in triage and learns per-source accuracy'
  );
END;
$$ LANGUAGE plpgsql;

-- Seed modes for all existing users
DO $$
DECLARE
  user_record RECORD;
BEGIN
  FOR user_record IN SELECT id FROM users LOOP
    PERFORM seed_default_scoring_modes(user_record.id);
  END LOOP;
END $$;

-- Create trigger to seed modes for new users
CREATE OR REPLACE FUNCTION trigger_seed_scoring_modes()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM seed_default_scoring_modes(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS seed_scoring_modes_on_user_insert ON users;
CREATE TRIGGER seed_scoring_modes_on_user_insert
  AFTER INSERT ON users
  FOR EACH ROW
  EXECUTE FUNCTION trigger_seed_scoring_modes();
