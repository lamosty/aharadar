-- Move default Anthropic model to Sonnet 4.6.
-- Keep user-selected custom models intact; only auto-upgrade legacy defaults.

ALTER TABLE llm_settings
  ALTER COLUMN anthropic_model SET DEFAULT 'claude-sonnet-4-6';

UPDATE llm_settings
SET anthropic_model = 'claude-sonnet-4-6'
WHERE anthropic_model IN (
  'claude-sonnet-4-20250514',
  'claude-sonnet-4-5',
  'claude-sonnet-4-5-20250929'
);
