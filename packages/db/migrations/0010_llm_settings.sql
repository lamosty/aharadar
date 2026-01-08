-- Global LLM settings (single row table)
-- Controls provider selection, model config, and Claude subscription settings

CREATE TABLE IF NOT EXISTS llm_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,

  -- Provider selection
  provider TEXT NOT NULL DEFAULT 'anthropic'
    CHECK (provider IN ('openai', 'anthropic', 'claude-subscription')),

  -- Model configuration per provider
  anthropic_model TEXT NOT NULL DEFAULT 'claude-sonnet-4-20250514',
  openai_model TEXT NOT NULL DEFAULT 'gpt-4o',

  -- Claude subscription settings
  claude_subscription_enabled BOOLEAN NOT NULL DEFAULT false,
  claude_triage_thinking BOOLEAN NOT NULL DEFAULT false,
  claude_calls_per_hour INTEGER NOT NULL DEFAULT 100,

  -- Metadata
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Ensure single row
  CONSTRAINT single_row CHECK (id = 1)
);

-- Insert default row
INSERT INTO llm_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Auto-update timestamp trigger
CREATE OR REPLACE FUNCTION update_llm_settings_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS llm_settings_updated_at ON llm_settings;
CREATE TRIGGER llm_settings_updated_at
  BEFORE UPDATE ON llm_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_llm_settings_timestamp();
