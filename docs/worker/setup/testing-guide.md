# Worker Testing Guide (SQLite-only)

> Status: Active
> Owner: @jdubz
> Last Updated: 2025-12-09

Firestore is no longer used. Worker tests should target the SQLite-backed pipeline. Remove or replace any Firestore emulator-based tests with SQLite fixtures and worker integration tests.
