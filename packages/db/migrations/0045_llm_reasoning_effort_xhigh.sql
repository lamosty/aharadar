-- Extend global LLM reasoning effort to include xhigh.
-- This keeps admin/API/runtime aligned with newer Codex reasoning levels.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'llm_settings_reasoning_effort_check'
  ) THEN
    ALTER TABLE llm_settings
    DROP CONSTRAINT llm_settings_reasoning_effort_check;
  END IF;

  ALTER TABLE llm_settings
  ADD CONSTRAINT llm_settings_reasoning_effort_check
  CHECK (reasoning_effort IN ('none', 'low', 'medium', 'high', 'xhigh'));
END $$;

COMMENT ON COLUMN llm_settings.reasoning_effort IS
  'Reasoning effort for OpenAI/Codex models: none, low, medium, high, xhigh';
