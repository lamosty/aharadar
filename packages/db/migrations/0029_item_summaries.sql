-- Item summaries table for manual paste-and-summarize workflow
-- Replaces content_item_deep_reviews (simpler: no status, just upsert summaries)

-- Create new table
CREATE TABLE IF NOT EXISTS content_item_summaries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content_item_id uuid NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
    summary_json jsonb NOT NULL,
    source text NOT NULL DEFAULT 'manual_paste',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes (idempotent)
CREATE UNIQUE INDEX IF NOT EXISTS content_item_summaries_user_item_idx
    ON content_item_summaries(user_id, content_item_id);
CREATE INDEX IF NOT EXISTS content_item_summaries_user_created_idx
    ON content_item_summaries(user_id, created_at DESC);

-- Migrate existing summaries from deep reviews (only if old table exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'content_item_deep_reviews') THEN
        INSERT INTO content_item_summaries (user_id, content_item_id, summary_json, source, created_at, updated_at)
        SELECT user_id, content_item_id, summary_json, 'manual_paste', created_at, updated_at
        FROM content_item_deep_reviews
        WHERE summary_json IS NOT NULL
        ON CONFLICT (user_id, content_item_id)
            DO UPDATE SET summary_json = EXCLUDED.summary_json, updated_at = EXCLUDED.updated_at;
    END IF;
END $$;

-- Drop the old table (idempotent)
DROP TABLE IF EXISTS content_item_deep_reviews;
