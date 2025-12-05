-- Add Gmail OAuth storage on users for multi-inbox ingest
ALTER TABLE users ADD COLUMN gmail_email TEXT;
ALTER TABLE users ADD COLUMN gmail_auth_json TEXT;

CREATE INDEX IF NOT EXISTS idx_users_gmail_email ON users(gmail_email);
