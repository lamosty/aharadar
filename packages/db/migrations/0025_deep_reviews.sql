-- Deep reviews table for manual summary workflow
CREATE TABLE IF NOT EXISTS content_item_deep_reviews (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content_item_id uuid NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
    status text NOT NULL,
    summary_json jsonb, -- Only populated when promoted
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS content_item_deep_reviews_user_item_idx
    ON content_item_deep_reviews(user_id, content_item_id);
CREATE INDEX IF NOT EXISTS content_item_deep_reviews_user_status_idx
    ON content_item_deep_reviews(user_id, status);
