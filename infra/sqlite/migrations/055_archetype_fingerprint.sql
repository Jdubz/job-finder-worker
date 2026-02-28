-- Archetype-based fingerprint for resume cache Tier 1.75: allows resumes to
-- hit across role title variations (e.g. "React Developer" ↔ "Frontend Engineer")
-- when they map to the same broad archetype + tech stack.
ALTER TABLE document_cache ADD COLUMN archetype_fingerprint_hash TEXT;

CREATE INDEX idx_document_cache_archetype_fingerprint
  ON document_cache(archetype_fingerprint_hash, content_items_hash, document_type);
