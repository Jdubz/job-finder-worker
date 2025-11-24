-- Safely drop legacy contact_submissions table if present (idempotent).
PRAGMA foreign_keys = OFF;
DROP TABLE IF EXISTS contact_submissions;
DROP INDEX IF EXISTS idx_contact_status;
PRAGMA foreign_keys = ON;
