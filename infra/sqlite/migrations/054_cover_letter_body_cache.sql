-- Add 'cover_letter_body' document type for sectional cover letter caching.
-- SQLite doesn't support ALTER CHECK, so we recreate the table.
-- Preserves all existing data and indexes (including role_fingerprint_hash from 053).

-- Step 1: Drop existing indexes (index names are global in SQLite;
-- renaming the table doesn't free the index names)
DROP INDEX IF EXISTS idx_document_cache_fingerprint;
DROP INDEX IF EXISTS idx_document_cache_embedding;
DROP INDEX IF EXISTS idx_document_cache_eviction;
DROP INDEX IF EXISTS idx_document_cache_content_hash;
DROP INDEX IF EXISTS idx_document_cache_role_fingerprint;

-- Step 2: Rename existing table
ALTER TABLE document_cache RENAME TO document_cache_old;

-- Step 3: Create new table with updated CHECK constraint
CREATE TABLE document_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    embedding_rowid INTEGER NOT NULL,
    document_type TEXT NOT NULL CHECK (document_type IN ('resume', 'cover_letter', 'cover_letter_body')),
    job_fingerprint_hash TEXT NOT NULL,
    content_items_hash TEXT NOT NULL,
    role_normalized TEXT NOT NULL,
    tech_stack_json TEXT,
    document_content_json TEXT NOT NULL,
    job_description_text TEXT,
    company_name TEXT,
    hit_count INTEGER DEFAULT 0,
    last_hit_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    model_version TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    role_fingerprint_hash TEXT
);

-- Step 4: Copy all existing data
INSERT INTO document_cache (
    id, embedding_rowid, document_type, job_fingerprint_hash, content_items_hash,
    role_normalized, tech_stack_json, document_content_json, job_description_text,
    company_name, hit_count, last_hit_at, model_version, created_at, role_fingerprint_hash
)
SELECT
    id, embedding_rowid, document_type, job_fingerprint_hash, content_items_hash,
    role_normalized, tech_stack_json, document_content_json, job_description_text,
    company_name, hit_count, last_hit_at, model_version, created_at, role_fingerprint_hash
FROM document_cache_old;

-- Step 5: Recreate all indexes on new table
CREATE INDEX idx_document_cache_fingerprint ON document_cache(job_fingerprint_hash, content_items_hash, document_type);
CREATE INDEX idx_document_cache_embedding ON document_cache(embedding_rowid);
CREATE INDEX idx_document_cache_eviction ON document_cache(last_hit_at, hit_count);
CREATE INDEX idx_document_cache_content_hash ON document_cache(content_items_hash);
CREATE INDEX idx_document_cache_role_fingerprint ON document_cache(role_fingerprint_hash, content_items_hash, document_type);

-- Step 6: Drop old table
DROP TABLE document_cache_old;
