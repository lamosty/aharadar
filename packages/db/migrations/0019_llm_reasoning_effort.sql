-- Add reasoning effort column to llm_settings
-- Default to 'none' for safety (budget models work without reasoning)

ALTER TABLE llm_settings
ADD COLUMN IF NOT EXISTS reasoning_effort TEXT NOT NULL DEFAULT 'none';

-- Add check constraint if not exists (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'llm_settings_reasoning_effort_check'
  ) THEN
    ALTER TABLE llm_settings
    ADD CONSTRAINT llm_settings_reasoning_effort_check
    CHECK (reasoning_effort IN ('none', 'low', 'medium', 'high'));
  END IF;
END $$;

COMMENT ON COLUMN llm_settings.reasoning_effort IS
  'Reasoning effort for OpenAI models: none (disable), low (800 tokens), medium (2000 tokens), high (4000 tokens)';
