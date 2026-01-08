-- Migration: 0007_user_roles.sql
-- Add role column to users table for admin/user separation

-- Add role column with default 'user'
ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user';

-- Add check constraint for valid roles (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_role_check') THEN
    ALTER TABLE users ADD CONSTRAINT users_role_check
      CHECK (role IN ('admin', 'user'));
  END IF;
END $$;

-- Create index for role lookups (useful for filtering)
CREATE INDEX IF NOT EXISTS users_role_idx ON users(role);
