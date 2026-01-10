-- Migration 0016: Purge signal connector data
-- Removes all signal-related data as the connector is being deprecated.
-- See docs/signals.md for deferral rationale.

-- Delete provider_calls with signal-related purposes
DELETE FROM provider_calls
WHERE purpose LIKE 'signal_%';

-- Delete sources with type = 'signal' (cascades to content_items via foreign keys)
DELETE FROM sources
WHERE type = 'signal';

-- Defensive: delete any remaining content_items with source_type = 'signal'
DELETE FROM content_items
WHERE source_type = 'signal';
