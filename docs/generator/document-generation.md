# Document Generation System

> Status: Completed
> Owner: @claude
> Last Updated: 2025-11-24

## Overview

The document generation system creates AI-powered resumes and cover letters using OpenAI/Codex. It uses content items from the database as the source data and applies configurable prompts to generate professional documents.

## Architecture

### Data Sources

1. **Content Items** (Primary Source)
   - Stored in `content_items` table
   - Contains all experience, education, and skills data
   - Supports hierarchical structure via `parent_id`
   - Fields: `title`, `role`, `location`, `description`, `skills`, etc.

2. **Personal Info**
   - Stored in `job_finder_config` table with id `personal-info`
   - Contains user contact information and presentation preferences
   - Fields: `name`, `email`, `phone`, `location`, `website`, `github`, `linkedin`, `accentColor`

3. **AI Prompts**
   - Stored in `job_finder_config` table with id `ai-prompts`
   - Contains configurable prompts for resume and cover letter generation
   - Supports variable interpolation with `{{variableName}}` syntax

### Generation Workflow

The generation process follows these steps:

1. **Request Creation** - Initialize generation request with job details and preferences
2. **Data Collection** - Fetch personal info and content items from database
3. **Document Generation** - Use AI provider to generate document content
4. **PDF Rendering** - Convert generated content to PDF using Handlebars templates
5. **Artifact Storage** - Save PDF to filesystem and track in database

### AI Provider

- **Primary Provider**: OpenAI/Codex (ChatGPT)
- **Status**: Currently the only active provider
- **Fallback Providers**: Gemini and Claude are included in the codebase for future implementation but are not currently supported

### Key Components

#### Backend Services

- **GeneratorWorkflowService** (`/modules/generator/workflow/generator.workflow.service.ts`)
  - Orchestrates the generation process
  - Tracks steps in-memory during execution
  - Integrates with content items, personal info, and prompts

- **PromptsRepository** (`/modules/prompts/prompts.repository.ts`)
  - Manages AI prompt configurations
  - Provides default prompts if custom ones are not configured

- **ContentItemRepository** (`/modules/content-items/content-item.repository.ts`)
  - Fetches user experience, education, and skills data
  - Returns hierarchical content structure

- **PersonalInfoStore** (`/modules/generator/personal-info.store.ts`)
  - Manages user personal information
  - Stored in job_finder_config table

#### Database Tables

- **content_items** - User experience, education, skills data
- **job_finder_config** - Configuration storage for personal info and AI prompts
- **generator_requests** - Tracks generation requests and their status
- **generator_artifacts** - References to generated PDF files

Note: The `generator_steps` table has been dropped (migration 011). Steps are now tracked in-memory only during request execution.

### API Endpoints

```
POST /generator/generate       - Generate documents synchronously
POST /generator/start          - Start async generation
POST /generator/step/:id       - Execute next step in generation
GET  /generator/requests       - List generation requests
GET  /generator/personal-info  - Fetch user defaults
PUT  /generator/personal-info  - Update user defaults
GET  /prompts                  - Get AI prompt configuration
PUT  /prompts                  - Update AI prompt configuration
```

## Configuration

### Environment Variables

```bash
DATABASE_PATH=/path/to/jobfinder.db
GENERATOR_ARTIFACTS_DIR=/data/artifacts
GENERATOR_ARTIFACTS_PUBLIC_BASE=/api/generator/artifacts
```

### Prompt Variables

The following variables are available for use in prompt templates:

- `{{candidateName}}` - User's name
- `{{jobTitle}}` - Target job title
- `{{companyName}}` - Target company name
- `{{jobDescription}}` - Job description text
- `{{userExperience}}` - Formatted experience from content items
- `{{userSkills}}` - Skills extracted from content items
- `{{additionalInstructions}}` - User-specified preferences

## Migrations Applied

The following database migrations have been successfully applied:

- **005_content_items_slim.sql** - Simplified content items schema, removing legacy fields
- **010_drop_legacy_experience_tables.sql** - Dropped experience_entries and experience_blurbs tables
- **011_drop_generator_steps.sql** - Dropped generator_steps table (steps now tracked in-memory)

## Recent Changes (Nov 2024)

1. **Content Items Refactoring**
   - Document generation now uses content_items exclusively
   - Legacy experience tables have been dropped
   - Unified schema for all resume/portfolio content

2. **AI Prompts Separation**
   - AI prompts removed from PersonalInfoDocument interface
   - Prompts now stored separately in ai-prompts config entry
   - Personal info contains only user contact and presentation data

3. **Provider Focus**
   - Primary focus on OpenAI/Codex provider
   - Gemini and Claude providers included for future support but not currently active
   - Fallback chain simplified to use only Codex

4. **In-Memory Step Tracking**
   - Generator steps no longer persisted to database
   - Steps tracked in-memory during request execution
   - Improves performance and reduces database overhead

## Testing

Tests have been updated to reflect the new architecture:

```bash
# Run generator workflow tests
npm test src/modules/generator/__tests__/generator.workflow.service.test.ts

# Run all server tests
npm test
```

All tests are passing with the updated implementation.

## Future Improvements

- Add support for additional AI providers (Gemini, Claude)
- Implement caching for frequently generated documents
- Add support for multiple document templates and styles
- Enhance prompt customization with more variables and options