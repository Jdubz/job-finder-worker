-- Selection cache: stores AI pool-item selection decisions keyed by job similarity.
-- Enables reuse of the same pool-item selection across semantically similar jobs
-- without re-running AI inference.
--
-- Uses the shared job_cache_embeddings vec0 table for semantic similarity search
-- (same 768D nomic-embed-text model as the document cache).

CREATE TABLE IF NOT EXISTS selection_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    embedding_rowid INTEGER NOT NULL,
    selection_json TEXT NOT NULL,
    tech_fingerprint_hash TEXT NOT NULL,
    broad_fingerprint_hash TEXT NOT NULL,
    pool_items_hash TEXT NOT NULL,
    role_types_json TEXT,
    tech_stack_json TEXT,
    role_normalized TEXT,
    hit_count INTEGER DEFAULT 0,
    last_hit_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tier 1: exact match on roleTypes + canonical techs + pool version
CREATE INDEX idx_selection_cache_tech_fp
  ON selection_cache(tech_fingerprint_hash, pool_items_hash);

-- Tier 1.5: broad match on roleTypes + tech categories + pool version
CREATE INDEX idx_selection_cache_broad_fp
  ON selection_cache(broad_fingerprint_hash, pool_items_hash);

-- LRU eviction ordering
CREATE INDEX idx_selection_cache_eviction
  ON selection_cache(last_hit_at, hit_count);
