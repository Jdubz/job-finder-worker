-- Semantic document cache for resume/cover letter generation
-- Tier 1: exact fingerprint match via SQLite index
-- Tier 2: semantic similarity via sqlite-vec (768D nomic-embed-text embeddings)

-- 768D text embeddings (nomic-embed-text via Ollama) via sqlite-vec
CREATE VIRTUAL TABLE job_cache_embeddings USING vec0(
    embedding FLOAT[768]
);

-- Cached document content with metadata
-- Each row is one document type (resume OR cover letter) for one job+profile combo.
CREATE TABLE document_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    embedding_rowid INTEGER NOT NULL,
    document_type TEXT NOT NULL CHECK (document_type IN ('resume', 'cover_letter')),
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
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tier 1 exact match: lookup by fingerprint + content hash + document type
CREATE INDEX idx_document_cache_fingerprint ON document_cache(job_fingerprint_hash, content_items_hash, document_type);
CREATE INDEX idx_document_cache_embedding ON document_cache(embedding_rowid);
-- Eviction query: ORDER BY last_hit_at ASC, hit_count ASC LIMIT n
CREATE INDEX idx_document_cache_eviction ON document_cache(last_hit_at, hit_count);
