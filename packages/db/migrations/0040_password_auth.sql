-- Migration: 0040_password_auth.sql
-- Replace magic link authentication with password authentication

-- Add password_hash column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- Drop auth_tokens table (no longer needed for magic links)
-- Keep sessions table for password-based sessions
DROP TABLE IF EXISTS auth_tokens;
