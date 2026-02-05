-- Add deep summary toggle to LLM settings
-- Default enabled to preserve existing behavior

ALTER TABLE llm_settings
  ADD COLUMN IF NOT EXISTS deep_summary_enabled BOOLEAN NOT NULL DEFAULT true;

-- Backfill in case existing rows predate the column
UPDATE llm_settings
  SET deep_summary_enabled = true
  WHERE deep_summary_enabled IS NULL;
