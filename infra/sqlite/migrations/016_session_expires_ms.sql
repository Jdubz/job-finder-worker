-- Add millisecond precision expiry for sessions
ALTER TABLE users ADD COLUMN session_expires_at_ms INTEGER;
-- Backfill from existing text column if present
UPDATE users
SET session_expires_at_ms = (strftime('%s', session_expires_at) * 1000)
WHERE session_expires_at IS NOT NULL AND session_expires_at_ms IS NULL;

CREATE INDEX IF NOT EXISTS idx_users_session_expires_at_ms ON users(session_expires_at_ms);
