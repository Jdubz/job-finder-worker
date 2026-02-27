-- Index for removeStaleEntries() and findSimilar() post-filter queries
-- that filter by content_items_hash without the job_fingerprint_hash prefix
CREATE INDEX IF NOT EXISTS idx_document_cache_content_hash ON document_cache(content_items_hash);
