-- User-provided API keys for LLM providers
-- Keys are encrypted with AES-256-GCM before storage

CREATE TABLE user_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL,  -- 'openai', 'anthropic', 'xai'
  encrypted_key BYTEA NOT NULL,   -- AES-256-GCM encrypted key
  iv BYTEA NOT NULL,              -- Initialization vector (12 bytes for GCM)
  key_suffix VARCHAR(8) NOT NULL, -- Last 4 chars for display (e.g., "...xxxx")
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, provider)       -- One key per provider per user
);

CREATE INDEX user_api_keys_user_idx ON user_api_keys(user_id);

COMMENT ON TABLE user_api_keys IS 'Encrypted storage for user-provided LLM API keys';
COMMENT ON COLUMN user_api_keys.encrypted_key IS 'AES-256-GCM encrypted API key';
COMMENT ON COLUMN user_api_keys.iv IS '12-byte initialization vector for GCM decryption';
COMMENT ON COLUMN user_api_keys.key_suffix IS 'Last 4 characters of key for user identification';
