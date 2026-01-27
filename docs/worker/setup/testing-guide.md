# Worker Testing Guide (SQLite-only)

> Status: Active
> Owner: @jdubz
> Last Updated: 2026-01-27

## Data Storage

The system uses **SQLite exclusively** for data storage. Firestore was fully migrated away from in late 2025.

**Current State:**
- Production database: `/srv/job-finder/data/jobfinder.db`
- All job sources, matches, companies, and queue data in SQLite
- Worker tests should target SQLite-backed pipeline with fixtures
- No Firestore emulator or Firebase dependencies needed for data storage

**Legacy Note:** Firebase Authentication is still used for user authentication in the frontend, but Firestore is completely removed.
