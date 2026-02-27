-- Role-only fingerprint for resume cache: allows resumes to hit Tier 1
-- across companies when role + tech stack match (company excluded from hash).
ALTER TABLE document_cache ADD COLUMN role_fingerprint_hash TEXT;

CREATE INDEX idx_document_cache_role_fingerprint
  ON document_cache(role_fingerprint_hash, content_items_hash, document_type);
