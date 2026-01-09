-- Fix digest_items.content_item_id FK to CASCADE instead of SET NULL.
-- SET NULL violates the digest_items_exactly_one_ref_chk constraint
-- which requires exactly one of cluster_id or content_item_id to be non-null.

ALTER TABLE digest_items
DROP CONSTRAINT IF EXISTS digest_items_content_item_id_fkey;

ALTER TABLE digest_items
ADD CONSTRAINT digest_items_content_item_id_fkey
FOREIGN KEY (content_item_id)
REFERENCES content_items(id)
ON DELETE CASCADE;
