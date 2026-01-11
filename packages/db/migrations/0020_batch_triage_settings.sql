-- Add batch triage settings to llm_settings
-- These control how triage calls are batched to reduce API usage

ALTER TABLE llm_settings
ADD COLUMN IF NOT EXISTS triage_batch_enabled BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE llm_settings
ADD COLUMN IF NOT EXISTS triage_batch_size INTEGER NOT NULL DEFAULT 15
  CHECK (triage_batch_size >= 1 AND triage_batch_size <= 50);

COMMENT ON COLUMN llm_settings.triage_batch_enabled IS
  'Enable batch triage processing to reduce API calls (default: true)';

COMMENT ON COLUMN llm_settings.triage_batch_size IS
  'Number of items per batch triage call (default: 15, range: 1-50)';
