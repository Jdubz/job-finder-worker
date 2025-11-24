-- Schema aggregator: applies the baseline migration plus incremental updates.
.read migrations/001_initial_schema.sql
.read migrations/002_queue_enhancements.sql
.read migrations/003_queue_type_extensions.sql
.read migrations/004_generator_workflow.sql
.read migrations/005_content_items_slim.sql
.read migrations/005_content_items_unify.sql
.read migrations/006_drop_contact_submissions.sql
.read migrations/006_drop_userid_visibility_content_items.sql
.read migrations/007_rebuild_content_items_without_userid.sql
