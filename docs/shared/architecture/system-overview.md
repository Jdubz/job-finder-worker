# System Architecture

> Status: Active
> Owner: @jdubz
> Last Updated: 2025-12-09

## Overview

The Job Finder application is a containerized monorepo with three main services: an Express API backend, a React frontend, and a Python worker for job processing. All services share a SQLite database and are orchestrated via Docker Compose.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    Job Finder Application                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────┐  ┌─────────────────────────────────┐   │
│  │  Frontend           │  │  Backend API                     │   │
│  │  (job-finder-FE/)   │  │  (job-finder-BE/)               │   │
│  │  ─────────────────  │  │  ────────────────────────────── │   │
│  │  - React 19         │  │  - Express.js                   │   │
│  │  - TypeScript       │  │  - TypeScript                   │   │
│  │  - Vite             │  │  - SQLite (better-sqlite3)      │   │
│  │  - TailwindCSS      │  │  - Google OAuth                 │   │
│  │  - Radix UI         │  │  - Pino logging                 │   │
│  └─────────────────────┘  └─────────────────────────────────┘   │
│                                                                  │
│  ┌─────────────────────┐  ┌─────────────────────────────────┐   │
│  │  Worker             │  │  Shared Types                    │   │
│  │  (job-finder-worker)│  │  (shared/)                      │   │
│  │  ─────────────────  │  │  ────────────────────────────── │   │
│  │  - Python/Flask     │  │  - TypeScript definitions       │   │
│  │  - Selenium         │  │  - API contracts                │   │
│  │  - SQLAlchemy       │  │  - Data models                  │   │
│  │  - Anthropic/OpenAI │  │  - Shared interfaces            │   │
│  └─────────────────────┘  └─────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Service Structure

### Frontend (job-finder-FE/)

- **Framework**: React 19 with TypeScript
- **Build Tool**: Vite
- **UI Components**: Radix UI + TailwindCSS
- **Authentication**: Google OAuth (client-side)
- **Testing**: Playwright, Vitest, React Testing Library

### Backend API (job-finder-BE/)

- **Framework**: Express.js with TypeScript
- **Database**: SQLite with better-sqlite3 driver
- **Authentication**: Google OAuth ID token verification
- **Authorization**: Role-based access control (admin, viewer)
- **Logging**: Pino (structured JSON)
- **Operational Stats**: Server-side stats endpoints for queue, job sources, job listings, and job matches to keep UI pill totals accurate beyond pagination limits
- **Port**: 8080

### Worker (job-finder-worker/)

- **Language**: Python 3.9+
- **Framework**: Flask
- **Database**: SQLAlchemy (SQLite)
- **Scraping**: Selenium, BeautifulSoup
- **AI Integration**: AgentManager with Gemini, Codex, Claude CLI providers
- **Data Processing**: pandas
- **Scoring Engine**: Experience-weighted skill matching derived from content-items
- **Profile Reducer**: Derives skills and experience years from content-items (work history)

### Shared Types (shared/)

- **Language**: TypeScript
- **Purpose**: Shared type definitions across frontend and backend
- **Package**: `@shared/types` workspace dependency
- **Contracts in Use**: Shared stats contracts (queue, job listings, job matches) and exported queue enums consumed directly by backend Zod validators to avoid drift

## Agent Manager

The AgentManager centralizes AI provider selection with fallback chains, daily budgets, and per-scope enablement.

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                       AgentManager                               │
├─────────────────────────────────────────────────────────────────┤
│  Task Types:                                                     │
│    - extraction: Job details, company info, source discovery    │
│    - analysis: Match scoring rationale, research synthesis      │
│    - document: Resume/cover letter generation                   │
├─────────────────────────────────────────────────────────────────┤
│  Fallback Chain (per task type):                                │
│    taskFallbacks.extraction: [gemini.cli, codex.cli, claude.cli]│
│    taskFallbacks.analysis: [codex.cli, gemini.cli, claude.cli]  │
│    taskFallbacks.document: [codex.cli, claude.cli, gemini.cli]  │
├─────────────────────────────────────────────────────────────────┤
│  Per-Agent Config:                                              │
│    - dailyBudget / dailyUsage (shared across scopes)            │
│    - runtimeState.worker / runtimeState.backend (per-scope)     │
│    - authRequirements (env vars, credential files)              │
└─────────────────────────────────────────────────────────────────┘
```

### Behavior

1. **Budget Enforcement**: Check budget BEFORE calling agent; disable on quota exhaustion
2. **Fallback**: On quota exhaustion, try next agent in chain; on API error, break
3. **Per-Scope Disabling**: Auth failures disable only the calling scope (worker/backend)
4. **Cron Reset**: Midnight job resets `dailyUsage` and re-enables quota-disabled agents

### Files

- Worker: `job-finder-worker/src/job_finder/ai/agent_manager.py`
- Backend: `job-finder-BE/server/src/modules/generator/ai/agent-manager.ts`
- Types: `shared/src/config.types.ts` (AISettings, AgentConfig, AgentTaskType)

## Scoring System

The ScoringEngine evaluates job-candidate fit using experience-weighted skill matching.

### Profile Reducer

Derives a `ScoringProfile` from content-items:

```
content_items (work history with dates + skills)
        ↓
   reduce_content_items()
        ↓
┌─────────────────────────────────────┐
│ ScoringProfile                      │
├─────────────────────────────────────┤
│ skills: Set[str]                    │  All unique skills (normalized)
│ skill_years: Dict[str, float]       │  Skill → years of experience
│ total_experience_years: float       │  Total from work items
└─────────────────────────────────────┘
```

### Skill Matching

```python
for skill in job_technologies:
    if skill in user_skills:
        points = baseMatchScore + min(years, maxYearsBonus) * yearsMultiplier
    elif skill has analog in user_skills:
        points = analogScore (typically 0)
    else:
        points = missingScore (negative)
```

### Files

- Profile Reducer: `job-finder-worker/src/job_finder/profile/reducer.py`
- Scoring Engine: `job-finder-worker/src/job_finder/scoring/engine.py`
- Config Types: `shared/src/config.types.ts` (SkillMatchConfig)

## Data Flow

### User Request Flow

1. **Browser**: User interacts with React frontend
2. **API Request**: Frontend calls Express API endpoints
3. **Authentication**: API validates Google OAuth token
4. **Database**: API queries/updates SQLite database
5. **Response**: Data returned to frontend for rendering

### Job Processing Flow

1. **Queue Submission**: User or system adds jobs to queue (via API)
2. **Worker Polling**: Python worker monitors queue for pending items
3. **Scraping**: Worker scrapes job listings using Selenium
4. **AI Analysis**: Worker uses AgentManager to select provider from fallback chain
5. **Scoring**: Profile reducer derives skills/experience; scoring engine evaluates fit
6. **Storage**: Results persisted to SQLite via SQLAlchemy
7. **Display**: Frontend fetches processed results via API

## Database Schema

SQLite database with migrations managed in `/infra/sqlite/migrations/`.

**Key Tables**:
- `users` - User accounts and roles
- `jobs` - Job listings
- `job_matches` - Matched jobs with scores
- `queue_items` - Processing queue
- `companies` - Company information
- `content_items` - Resume/portfolio content

## API Routes

```
/api/
  ├── /content-items          (authenticated)
  ├── /queue                  (authenticated)
  │   └── /stats              (server-side queue totals)
  ├── /job-sources            (authenticated)
  │   └── /stats              (source-level totals)
  ├── /job-listings           (authenticated)
  │   └── /stats              (listing status totals)
  ├── /job-matches            (authenticated)
  │   └── /stats              (score buckets + averages)
  ├── /config                 (admin-only)
  ├── /generator              (authenticated)
  │   ├── /artifacts
  │   └── /workflow
  ├── /prompts                (public GET, authenticated mutations)
  ├── /healthz                (health check)
  └── /readyz                 (readiness check)
```

## Infrastructure

### Docker Compose Services

Production deployment via Docker Compose with 5 services:

1. **api** - Express backend (port 8080)
2. **worker** - Python job processor
3. **sqlite-migrator** - Database migrations on startup
4. **cloudflared** - Cloudflare tunnel for external access
5. **watchtower** - Automatic container updates

### Database Location

- **Development**: `./data/sqlite/jobfinder.db`
- **Production**: `/data/sqlite/jobfinder.db` (Docker volume)

## Technology Stack Summary

| Layer      | Technology           |
|------------|---------------------|
| Frontend   | React, TypeScript, Vite, TailwindCSS |
| Backend    | Express.js, TypeScript |
| Database   | SQLite (better-sqlite3, SQLAlchemy) |
| Worker     | Python, Flask, Selenium |
| AI         | AgentManager (Gemini CLI, Codex CLI, Claude CLI) |
| Search     | Tavily, Brave (company enrichment) |
| Auth       | Google OAuth |
| Deployment | Docker Compose, Cloudflare |
