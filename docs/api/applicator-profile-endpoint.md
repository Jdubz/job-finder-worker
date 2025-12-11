# Applicator Profile API Endpoint

> Status: Active
> Owner: @jdubz
> Last Updated: 2025-12-10

## Overview

The `/api/applicator/profile` endpoint returns complete user profile data pre-formatted as plain text, optimized for AI prompt injection in the job-applicator desktop app.

## Endpoint Details

**URL:** `GET /api/applicator/profile`

**Authentication:** Required (session cookie or dev token)

**Rate Limiting:** None (internal tool usage only)

## Response Format

Returns a single `profileText` field containing markdown-formatted sections:

```typescript
{
  success: true,
  data: {
    profileText: string
  }
}
```

## Profile Text Structure

The `profileText` contains the following sections:

### 1. Personal Information
- Name, email, phone
- Location, website
- GitHub, LinkedIn
- Professional summary

### 2. EEO Information (free-text, if provided)
- Gender
- Race/ethnicity
- Veteran status
- Disability status

### 3. Work Experience
Hierarchical format with companies, roles, and highlights:
```
## Company Name - Role Title
2022-01 - Present
Location

Description of role and responsibilities

Skills: JavaScript, TypeScript, Node.js

Highlights:
- Key achievement or project
- Another significant accomplishment
```

### 4. Education
```
Institution - Degree
2018-01 - 2022-05
Description or field of study
```

### 5. Skills Summary
Comma-separated list of all unique skills aggregated from work history

## Example Response

```json
{
  "success": true,
  "data": {
    "profileText": "# Personal Information\nName: John Doe\nEmail: john@example.com\nPhone: 555-0123\nLocation: Portland, OR\nWebsite: https://johndoe.com\nGitHub: https://github.com/johndoe\nLinkedIn: https://linkedin.com/in/johndoe\n\nSummary:\nSenior Backend Engineer with 8+ years of experience...\n\n---\n\n# Work Experience\n\n## Acme Corp - Senior Backend Engineer\n2022-01 - Present\nPortland, OR\n\nLead backend development for high-traffic SaaS platform serving 1M+ users.\n\nSkills: Node.js, TypeScript, PostgreSQL, Redis, Docker\n\nHighlights:\n- Architected microservices migration reducing API latency by 40%\n- Implemented event-driven architecture with Kafka\n- Mentored 3 junior engineers\n\n## Previous Company - Backend Engineer\n2019-06 - 2021-12\nRemote\n\nBuilt REST APIs and GraphQL services for e-commerce platform.\n\nSkills: Python, Django, AWS, PostgreSQL\n\n---\n\n# Education\n\nUniversity of Technology - B.S. Computer Science\n2015-09 - 2019-05\nFocus on distributed systems and databases\n\n---\n\n# Skills\nAWS, Django, Docker, GraphQL, Kafka, Node.js, PostgreSQL, Python, Redis, TypeScript"
  }
}
```

## Usage in Job Applicator

The job-applicator desktop app uses this endpoint to fetch profile data for AI-powered form filling:

```typescript
// In job-applicator/src/main.ts
const API_URL = process.env.JOB_FINDER_API_URL || 'http://localhost:3000/api'

async function getProfile(): Promise<string> {
  const response = await fetch(`${API_URL}/applicator/profile`, {
    credentials: 'include' // Send session cookie
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch profile: ${response.status}`)
  }

  const { data } = await response.json()
  return data.profileText
}

// Use in AI prompt
const profileText = await getProfile()
const prompt = `
Fill this job application form using the candidate's profile below.

${profileText}

---

Form fields:
${JSON.stringify(formFields)}

Return JSON with field selectors and values to fill.
`
```

## Benefits

### Token Efficiency
- Pre-formatted text uses fewer tokens than nested JSON structures
- Eliminates need for client-side formatting logic
- Optimized for AI model consumption

### Consistency
- Single source of truth for profile data
- Same format used across all job applications
- Reduces variation in AI responses

### Completeness
- Includes all relevant user data in one request
- No need for multiple API calls
- Hierarchical work history with full context

## Authentication

The endpoint requires authentication via:
1. Session cookie (production)
2. Dev token via Bearer header (development)
3. Localhost bypass (if `ALLOW_LOCALHOST_BYPASS=true`)

Example with dev token:
```bash
curl http://localhost:3000/api/applicator/profile \
  -H "Authorization: Bearer dev-token-admin"
```

## Error Handling

### 401 Unauthorized
```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Authentication required"
  }
}
```

### 404 Not Found (if route not registered)
```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Resource not found"
  }
}
```

## Data Sources

The endpoint aggregates data from:

1. **job_finder_config table** - Personal info (id: 'personal-info') including required `applicationInfo` free-text
2. **content_items table** - Work history, education, skills (all items with tree structure)

## Performance

- Typical response time: < 50ms
- Response size: 2-10 KB (depending on work history)
- No external API calls or complex computations
- Database queries use indexed lookups

## Future Enhancements

Potential improvements for future versions:

1. **Caching** - Cache formatted profile text for 5 minutes
2. **Filtering** - Add query params to include/exclude sections
3. **Templates** - Support different format templates (markdown, plain text, JSON)
4. **Versioning** - Track profile version to invalidate client cache
