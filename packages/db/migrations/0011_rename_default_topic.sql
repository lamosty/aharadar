-- Rename existing "default" topics to "General" (only if no conflict)
UPDATE topics t
SET name = 'General'
WHERE t.name = 'default'
  AND NOT EXISTS (
    SELECT 1 FROM topics t2
    WHERE t2.user_id = t.user_id AND t2.name = 'General'
  );
