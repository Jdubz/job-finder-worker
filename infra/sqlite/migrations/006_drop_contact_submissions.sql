-- Remove legacy contact submissions table (unused in the current application).

PRAGMA foreign_keys = OFF;

DROP TABLE IF EXISTS contact_submissions;
DROP INDEX IF EXISTS idx_contact_status;

PRAGMA foreign_keys = ON;
