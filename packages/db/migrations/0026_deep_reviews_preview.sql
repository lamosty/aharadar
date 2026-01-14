-- Allow "preview" status for deep reviews (manual summary previews)
-- Previously: status IN ('promoted', 'dropped')
-- Now: status IN ('preview', 'promoted', 'dropped')

-- Drop old constraint if exists and recreate with new values (idempotent)
DO $$
BEGIN
  -- Drop old constraint if it exists
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'content_item_deep_reviews_status_check'
  ) THEN
    ALTER TABLE content_item_deep_reviews
      DROP CONSTRAINT content_item_deep_reviews_status_check;
  END IF;

  -- Add new constraint
  ALTER TABLE content_item_deep_reviews
    ADD CONSTRAINT content_item_deep_reviews_status_check
    CHECK (status IN ('preview', 'promoted', 'dropped'));
EXCEPTION
  WHEN duplicate_object THEN
    -- Constraint already exists with correct definition, ignore
    NULL;
END $$;
