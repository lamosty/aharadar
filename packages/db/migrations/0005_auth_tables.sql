-- Migration: 0005_auth_tables.sql
-- Magic link authentication tables

-- Auth tokens for magic links
-- Token is hashed (SHA-256) before storage, plain token sent in email
CREATE TABLE IF NOT EXISTS auth_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  purpose TEXT NOT NULL DEFAULT 'magic_link',
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS auth_tokens_user_id_idx ON auth_tokens(user_id);
CREATE INDEX IF NOT EXISTS auth_tokens_expires_idx ON auth_tokens(expires_at) WHERE used_at IS NULL;

-- Sessions for authenticated users
-- Session token is hashed before storage, plain token stored in httpOnly cookie
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  user_agent TEXT,
  ip_address TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_token_hash_idx ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions(expires_at);

-- Add unique constraint on email for proper auth lookup
-- Only applies to non-null emails to allow existing null entries
CREATE UNIQUE INDEX IF NOT EXISTS users_email_uniq ON users(lower(email)) WHERE email IS NOT NULL;
