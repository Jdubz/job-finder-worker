> Status: Active
> Owner: @jdubz
> Last Updated: 2026-01-27

# Migration History

## Firestore to SQLite Migration (Late 2025)

### Overview
Completed full migration from Firebase Firestore to SQLite for all data storage.

### What Was Migrated
- **Job Sources**: All job source configurations and metadata
- **Job Listings**: All scraped job postings
- **Job Matches**: All job match scores and data
- **Job Queue**: All queue items and processing state
- **Companies**: All company records
- **User Data**: Experience entries, blurbs, content items, summaries
- **Configuration**: System configuration and settings

### What Remains
- **Firebase Hosting**: Frontend is still deployed to Firebase Hosting
- **Firebase Authentication**: Google OAuth authentication still uses Firebase Auth

### Production Database
- **Location**: `/srv/job-finder/data/jobfinder.db`
- **Size**: ~88MB (as of Jan 2026)
- **Schema**: See `infra/sqlite/schema.sql`
- **Backups**: Located in `/srv/job-finder/backups/`

### Legacy Data Removed
- **Date**: January 27, 2026
- **Action**: Removed `data/firestore-exports/` directory
- **Reason**: Outdated exports from pre-migration era, causing confusion
- **Impact**: None - all data is in SQLite production database

### Documentation Updates
- Updated all testing guides to reference SQLite only
- Clarified Firebase Auth vs Firestore distinction
- Removed references to Firestore emulators and Firebase Admin SDK for data operations
- Updated architecture diagrams to show SQLite as sole datastore
