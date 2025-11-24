-- Drop generator_steps table - steps are now tracked in-memory only
-- Workflow state doesn't need database persistence during active requests.
-- Idempotent: safe to rerun; IF EXISTS ensures no error if already dropped.

PRAGMA foreign_keys = OFF;

DROP TABLE IF EXISTS generator_steps;

PRAGMA foreign_keys = ON;
