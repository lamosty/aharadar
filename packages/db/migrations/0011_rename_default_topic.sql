-- Rename existing "default" topics to "General" (only if no conflict)
UPDATE topics t
SET name = 'General'
WHERE t.name = 'default'
  AND NOT EXISTS (
    SELECT 1 FROM topics t2
    WHERE t2.user_id = t.user_id AND t2.name = 'General'
  );

-- Delete orphaned "default" topics when user has other topics
-- (handles case where rename was skipped because "General" already existed)
DELETE FROM topics t
WHERE t.name = 'default'
  AND EXISTS (
    SELECT 1 FROM topics t2
    WHERE t2.user_id = t.user_id AND t2.id != t.id
  );

-- Delete empty "General" topics when user has other topics with sources
-- (keeps the system clean - only keep General if it's the user's only topic or has sources)
DELETE FROM topics t
WHERE t.name = 'General'
  AND NOT EXISTS (
    SELECT 1 FROM sources s WHERE s.topic_id = t.id
  )
  AND EXISTS (
    SELECT 1 FROM topics t2
    JOIN sources s ON s.topic_id = t2.id
    WHERE t2.user_id = t.user_id AND t2.id != t.id
  );
