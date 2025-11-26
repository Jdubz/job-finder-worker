-- Schema aggregator: applies the baseline migration plus incremental updates.
.read migrations/001_initial_schema.sql
.read migrations/002_queue_enhancements.sql
.read migrations/003_queue_type_extensions.sql
.read migrations/004_generator_workflow.sql
.read migrations/005_content_items_slim.sql
.read migrations/006_drop_contact_submissions.sql
.read migrations/007_config_name_column.sql
.read migrations/009_cleanup_legacy_content_migrations.sql
.read migrations/010_drop_legacy_experience_tables.sql
.read migrations/011_drop_generator_steps.sql
.read migrations/012_company_state_machine.sql
