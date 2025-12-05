-- Add Gmail OAuth storage on users for multi-inbox ingest
ALTER TABLE users ADD COLUMN gmail_email TEXT;
ALTER TABLE users ADD COLUMN gmail_auth_json TEXT;

-- Each Gmail inbox should be linked to exactly one app user
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_gmail_email ON users(gmail_email);
