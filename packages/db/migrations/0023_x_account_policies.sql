-- x_account_policies: per-account throttling based on feedback
-- Tracks feedback-derived scores and mode overrides for X accounts

CREATE TABLE IF NOT EXISTS x_account_policies (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id uuid NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    handle text NOT NULL, -- lowercase, without @
    mode text NOT NULL DEFAULT 'auto' CHECK (mode IN ('auto', 'always', 'mute')),
    pos_score double precision NOT NULL DEFAULT 0,
    neg_score double precision NOT NULL DEFAULT 0,
    last_feedback_at timestamptz,
    last_updated_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Unique constraint on source + handle
CREATE UNIQUE INDEX IF NOT EXISTS x_account_policies_source_handle_idx
    ON x_account_policies(source_id, handle);

-- Index for listing policies by source
CREATE INDEX IF NOT EXISTS x_account_policies_source_idx
    ON x_account_policies(source_id);

-- Create update_updated_at function if not exists
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at (drop and recreate for idempotency)
DROP TRIGGER IF EXISTS x_account_policies_updated_at ON x_account_policies;
CREATE TRIGGER x_account_policies_updated_at
    BEFORE UPDATE ON x_account_policies
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();
