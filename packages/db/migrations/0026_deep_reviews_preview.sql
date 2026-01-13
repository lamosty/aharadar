-- Allow "preview" status for deep reviews (manual summary previews)
-- Previously: status IN ('promoted', 'dropped')
-- Now: status IN ('preview', 'promoted', 'dropped')

ALTER TABLE content_item_deep_reviews
  DROP CONSTRAINT content_item_deep_reviews_status_check;

ALTER TABLE content_item_deep_reviews
  ADD CONSTRAINT content_item_deep_reviews_status_check
  CHECK (status IN ('preview', 'promoted', 'dropped'));
