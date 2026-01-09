-- Rename existing "default" topics to "General"
UPDATE topics SET name = 'General' WHERE name = 'default';
