# Document Generator Architecture

> Status: Active
> Owner: @jdubz
> Last Updated: 2026-01-09

The document generator creates tailored resumes and cover letters using AI to customize content for specific job listings.

## Overview

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Generate API   │────▶│  AgentManager   │────▶│  PdfMake        │
│  /generator     │     │  (AI Fallback)  │     │  Service        │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │                       │
        ▼                       ▼                       ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ Content Items   │     │  AI Prompts     │     │  PDF Artifacts  │
│ (authoritative) │     │  (customized)   │     │  (output)       │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

## Data Flow

### 1. Request Phase
- User submits job details (role, company, description)
- System loads personal info from `job_finder_config`
- System loads content items from `content_items` table

### 2. AI Generation Phase
- Builds prompt with job details + user experience
- AgentManager selects provider from fallback chain (claude.cli, gemini.api)
- AI returns JSON with customized highlights and summary

### 3. Data Merge Phase
**Content items are authoritative** for:
- Dates (startDate, endDate)
- Company names
- Locations
- Technologies/skills

**AI output customizes**:
- Professional summary (tailored to job)
- Experience highlights (emphasizing relevant achievements)
- Skills organization (categorized for role)

### 4. PDF Generation Phase
- PdfMake renders the merged data
- Supports header with avatar/logo
- Section headers with accent color
- Two-column skills grid
- Footer attribution

## Key Files

| File | Purpose |
|------|---------|
| `generator.workflow.service.ts` | Main orchestration logic |
| `pdfmake.service.ts` | PDF rendering with pdfmake |
| `prompts.ts` | AI prompt construction |
| `agent-manager.ts` | AI provider selection with fallback |
| `storage.service.ts` | Artifact storage |

## Configuration

### Personal Info (`personal-info` config)
```json
{
  "name": "Full Name",
  "email": "email@example.com",
  "location": "City, State",
  "website": "https://...",
  "linkedin": "https://linkedin.com/in/...",
  "github": "https://github.com/...",
  "accentColor": "#3B82F6",
  "avatar": "/assets/avatar.jpg",
  "logo": "/assets/logo.svg"
}
```

### AI Prompts (`ai-prompts` config)
Prompts can be customized via the `/api/prompts` endpoint or admin UI.
Default prompts specify JSON schema for AI output.

## Content Item Taxonomy

Content items use `aiContext` to categorize:
- `work` - Employment entries (company + role)
- `highlight` - Achievements within work context
- `project` - Personal/independent projects
- `education` - Degrees, certifications
- `skills` - Skill categories
- `narrative` - Bio, summary, overview
- `section` - Container for grouping

## Validation Testing

Use the validation harness in `job-finder-BE/server/validation/`:

```bash
# Clone prod database
./clone-prod-db.sh

# Ensure personal-info is set
./setup-personal-info.sh

# Run validation
./run-validation.sh
```

Output artifacts are in `volumes/artifacts/`.

## AI Providers

Supported agents (via AgentManager):
- **claude.cli** - Claude Code CLI (requires `CLAUDE_CODE_OAUTH_TOKEN`)
- **gemini.api** - Google Gemini API (requires `GOOGLE_API_KEY` or `GEMINI_API_KEY`)

Note: Legacy Handlebars/Puppeteer PDF generation was removed in favor of pdfmake for simpler, more reliable PDF creation without browser dependencies.
