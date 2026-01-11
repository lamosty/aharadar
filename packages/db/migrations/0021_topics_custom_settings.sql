-- Add custom_settings JSONB column to topics table
-- Used for per-topic configuration including personalization tuning

ALTER TABLE topics
ADD COLUMN IF NOT EXISTS custom_settings JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN topics.custom_settings IS
  'Per-topic configuration (e.g., personalization_tuning_v1). Schema versioned.';
