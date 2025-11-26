-- Persist session token per user
ALTER TABLE users ADD COLUMN session_token TEXT;
ALTER TABLE users ADD COLUMN session_expires_at TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_session_token ON users(session_token);
