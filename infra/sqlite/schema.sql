-- Schema aggregator: applies the baseline migration plus incremental updates.
.read migrations/001_initial_schema.sql
.read migrations/002_queue_enhancements.sql
.read migrations/003_queue_type_extensions.sql
