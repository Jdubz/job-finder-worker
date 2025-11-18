# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.2.1] - 2025-10-27

### Added
- Added `contentData` field to GeneratorRequest for BE compatibility
- Added error stages: "openai_generation" and "gemini_generation"
- Added "system" to LogCategory for BE logging
- Added BE-specific fields to StructuredLogEntry (userId, requestId, http)
- Added type guards: isGenerationType, isAIProviderType, isGenerationStepStatus

### Changed
- Made GeneratorRequest.access.userId optional for flexibility
- Made AIProviderType include "gemini" (previously OpenAI only)
- Updated TimestampLike usage across all timestamp fields in QueueItem and JobMatch
- Removed deprecated JobMatchLegacy type (cleaned up legacy code)

### Fixed
- All `Date | any` types replaced with `TimestampLike` for type safety
- Type consistency between FE and BE for generator types

## [1.2.0] - 2025-10-21

### Added
- **Complete Firestore Schema Types**: Codified production database schema from portfolio database
  - `QueueItemDocument`: Job queue collection schema
  - `CompanyDocument`: Companies collection with priority scoring and tech stack
  - `ContentItemDocument`: Portfolio content items with multiple content types (company, project, skill-group, text-section, profile-section)
  - `ContactSubmissionDocument`: Contact form submissions with email transaction tracking
  - `UserDocument`: User authentication and profile structure
  - `ConfigDocument`: Application configuration documents
- **Type Guards for Firestore Schema**: Runtime validation for all Firestore document types
  - Collection-specific guards (isQueueItemDocument, isCompanyDocument, etc.)
  - Enum guards for document status and types
- **Schema Extraction Script**: Automated tool to extract schema from production Firestore (`scripts/extract-firestore-schema.js`)
- **Firestore Schema Documentation**: Comprehensive docs for all collections and document types
- Exported schema types and guards from main package index
- Automated package publishing workflow via GitHub Actions
- CHANGELOG.md for tracking version history
- .npmignore for optimizing published package contents

### Changed
- Renamed Firestore schema types to avoid conflicts with existing application types
  - Used "Document" suffix for Firestore-specific types (e.g., `QueueItemDocument` vs `QueueItem`)
  - Enum types also renamed (e.g., `QueueItemDocumentStatus` vs `QueueItemStatus`)
- Re-exported Firestore schema guards from main guards module for convenience
- Publish workflow triggers on semantic version tags (`v*.*.*`)
- CI workflow runs on pull requests to guard publishing quality

### Fixed
- Type conflicts between application layer types and database schema types

## [1.1.1] - 2025-10-20

### Added
- Complete TypeScript type definitions for the job-finder ecosystem
- Resume customization types (ResumeIntakeData, ExperienceHighlight, GapMitigation)
- Settings types (AISettings, QueueSettings, StopList)
- Logging and generator types for comprehensive coverage

### Changed
- Improved type documentation and package configuration for npm publishing

### Fixed
- TypeScript build outputs with declaration files

## [1.1.0] - 2025-10-19

### Added
- Enhanced type definitions for job finder and portfolio projects
- Comprehensive type documentation in README.md

## [1.0.0] - 2025-10-18

### Added
- Initial package structure and build configuration
- Core types: QueueItem, JobListing, JobMatch, Company
- Helper types for queue management and AI settings
- TypeScript type definitions with `.d.ts` output
- Python integration examples

[Unreleased]: https://github.com/Jdubz/job-finder-shared-types/compare/v1.2.1...HEAD
[1.2.1]: https://github.com/Jdubz/job-finder-shared-types/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/Jdubz/job-finder-shared-types/compare/v1.1.1...v1.2.0
[1.1.1]: https://github.com/Jdubz/job-finder-shared-types/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/Jdubz/job-finder-shared-types/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/Jdubz/job-finder-shared-types/releases/tag/v1.0.0
