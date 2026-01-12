-- Migration: Convert existing 'save' feedback actions to 'like'
-- The 'save' action is being removed from the application.
-- All existing saves are migrated to likes to preserve user preference data.

UPDATE feedback_events
SET action = 'like'
WHERE action = 'save';
