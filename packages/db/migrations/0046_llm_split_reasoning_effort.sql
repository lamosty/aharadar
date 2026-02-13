-- Split global LLM reasoning effort into separate triage and summary controls.
-- Keep legacy reasoning_effort for backward compatibility while migrating runtime paths.

ALTER TABLE llm_settings
  ADD COLUMN IF NOT EXISTS triage_reasoning_effort TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS summary_reasoning_effort TEXT NOT NULL DEFAULT 'none';

-- Backfill from legacy reasoning_effort so existing users keep prior behavior.
UPDATE llm_settings
SET
  triage_reasoning_effort = COALESCE(NULLIF(triage_reasoning_effort, ''), reasoning_effort),
  summary_reasoning_effort = COALESCE(NULLIF(summary_reasoning_effort, ''), reasoning_effort);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'llm_settings_triage_reasoning_effort_check'
  ) THEN
    ALTER TABLE llm_settings
    DROP CONSTRAINT llm_settings_triage_reasoning_effort_check;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'llm_settings_summary_reasoning_effort_check'
  ) THEN
    ALTER TABLE llm_settings
    DROP CONSTRAINT llm_settings_summary_reasoning_effort_check;
  END IF;

  ALTER TABLE llm_settings
    ADD CONSTRAINT llm_settings_triage_reasoning_effort_check
    CHECK (triage_reasoning_effort IN ('none', 'low', 'medium', 'high', 'xhigh'));

  ALTER TABLE llm_settings
    ADD CONSTRAINT llm_settings_summary_reasoning_effort_check
    CHECK (summary_reasoning_effort IN ('none', 'low', 'medium', 'high', 'xhigh'));
END $$;

COMMENT ON COLUMN llm_settings.triage_reasoning_effort IS
  'Reasoning effort for LLM triage calls: none, low, medium, high, xhigh';

COMMENT ON COLUMN llm_settings.summary_reasoning_effort IS
  'Reasoning effort for AI summary calls (deep/manual): none, low, medium, high, xhigh';
