-- Add reasoning effort column to llm_settings
-- Default to 'none' for safety (budget models work without reasoning)

ALTER TABLE llm_settings
ADD COLUMN reasoning_effort TEXT NOT NULL DEFAULT 'none'
  CHECK (reasoning_effort IN ('none', 'low', 'medium', 'high'));

COMMENT ON COLUMN llm_settings.reasoning_effort IS
  'Reasoning effort for OpenAI models: none (disable), low (800 tokens), medium (2000 tokens), high (4000 tokens)';
