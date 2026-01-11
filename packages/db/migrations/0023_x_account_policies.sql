-- x_account_policies: per-account throttling based on feedback
-- Tracks feedback-derived scores and mode overrides for X accounts

CREATE TABLE x_account_policies (
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
CREATE UNIQUE INDEX x_account_policies_source_handle_idx
    ON x_account_policies(source_id, handle);

-- Index for listing policies by source
CREATE INDEX x_account_policies_source_idx
    ON x_account_policies(source_id);

-- Trigger to auto-update updated_at
CREATE TRIGGER x_account_policies_updated_at
    BEFORE UPDATE ON x_account_policies
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();
