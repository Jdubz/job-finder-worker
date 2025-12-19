-- Create user_sessions table for multi-session support
-- Allows users to be logged in from multiple devices/browsers simultaneously

-- Note: We don't use REFERENCES users(id) because migration 038 used CREATE TABLE AS SELECT
-- which removed the PRIMARY KEY constraint from users.id. SQLite foreign keys require
-- the parent column to be PRIMARY KEY or have a UNIQUE constraint.
-- Cascade deletes are handled in application code via deleteAllUserSessions().
CREATE TABLE IF NOT EXISTS user_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at_ms INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT NOT NULL DEFAULT (datetime('now')),
  user_agent TEXT,
  ip_address TEXT
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token_hash ON user_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at_ms ON user_sessions(expires_at_ms);

-- Migrate existing sessions from users table to user_sessions
INSERT INTO user_sessions (id, user_id, token_hash, expires_at_ms, created_at, last_used_at)
SELECT
  lower(
    hex(randomblob(4)) || '-' ||
    hex(randomblob(2)) || '-' ||
    hex(randomblob(2)) || '-' ||
    hex(randomblob(2)) || '-' ||
    hex(randomblob(6))
  ),
  id,
  session_token,
  session_expires_at_ms,
  COALESCE(last_login_at, datetime('now')),
  COALESCE(last_login_at, datetime('now'))
FROM users
WHERE session_token IS NOT NULL AND session_expires_at_ms IS NOT NULL;

-- Note: We keep the old session columns in users table for backward compatibility
-- They can be removed in a future migration after the new system is verified
