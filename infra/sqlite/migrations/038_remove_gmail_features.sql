-- Remove Gmail-related tables and columns

-- Drop email_ingest_state if it exists
DROP TABLE IF EXISTS email_ingest_state;

-- Remove gmail_auth_json and gmail_email columns from users (if they exist)
PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS users_tmp AS
SELECT id, email, display_name, avatar_url, roles, created_at, updated_at, last_login_at, session_token, session_expires_at, session_expires_at_ms
FROM users;

DROP TABLE users;

ALTER TABLE users_tmp RENAME TO users;

PRAGMA foreign_keys = ON;
