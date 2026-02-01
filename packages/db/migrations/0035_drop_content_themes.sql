-- Drop content-based theme tables (replaced by triage theme embedding clustering)
--
-- The old system used content embeddings to cluster items into themes.
-- The new system embeds triage theme strings (1-3 words) and stores
-- theme_label directly on digest_items for UI grouping.

DROP INDEX IF EXISTS theme_items_content_idx;
DROP TABLE IF EXISTS theme_items;

DROP INDEX IF EXISTS themes_centroid_hnsw;
DROP INDEX IF EXISTS themes_topic_user_idx;
DROP TABLE IF EXISTS themes;
