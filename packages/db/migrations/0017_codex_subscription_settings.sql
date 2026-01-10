-- Add Codex subscription settings to llm_settings table
-- Mirrors the Claude subscription pattern for OpenAI Codex SDK

-- Update provider CHECK constraint to include 'codex-subscription'
ALTER TABLE llm_settings
  DROP CONSTRAINT IF EXISTS llm_settings_provider_check;

ALTER TABLE llm_settings
  ADD CONSTRAINT llm_settings_provider_check
  CHECK (provider IN ('openai', 'anthropic', 'claude-subscription', 'codex-subscription'));

-- Add Codex subscription columns
ALTER TABLE llm_settings
  ADD COLUMN IF NOT EXISTS codex_subscription_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS codex_calls_per_hour INTEGER NOT NULL DEFAULT 50;
