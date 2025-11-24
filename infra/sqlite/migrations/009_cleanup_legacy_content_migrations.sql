-- Cleanup legacy migration ledger entries that are no longer part of the canonical sequence.
-- Idempotent: safe to rerun; only removes rows if present.

DELETE FROM schema_migrations WHERE name IN (
  '005_content_items_unify.sql',
  '006_drop_userid_visibility_content_items.sql',
  '007_rebuild_content_items_without_userid.sql'
);
