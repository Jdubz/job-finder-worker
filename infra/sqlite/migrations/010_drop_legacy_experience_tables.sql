-- Drop legacy experience tables now that content_items is the canonical source.
-- The worker (sqlite_loader.py) has been updated to read from content_items.
-- Idempotent: safe to rerun; IF EXISTS ensures no error if already dropped.

PRAGMA foreign_keys = OFF;

DROP TABLE IF EXISTS experience_blurbs;
DROP TABLE IF EXISTS experience_entries;

PRAGMA foreign_keys = ON;
