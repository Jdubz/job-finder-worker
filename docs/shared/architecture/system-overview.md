# System Architecture

> Status: Active
> Owner: @jdubz
> Last Updated: 2025-12-05

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
- **AI Integration**: Anthropic Claude, OpenAI
- **Data Processing**: pandas
- **Scoring Engine**: Deterministic scoring with de-duplicated tech vs. skill scoring and configurable `missingRequiredScore` penalty (weights section removed)

### Shared Types (shared/)

- **Language**: TypeScript
- **Purpose**: Shared type definitions across frontend and backend
- **Package**: `@shared/types` workspace dependency
- **Contracts in Use**: Shared stats contracts (queue, job listings, job matches) and exported queue enums consumed directly by backend Zod validators to avoid drift

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
4. **AI Analysis**: Worker analyzes jobs using Claude/OpenAI
5. **Storage**: Results persisted to SQLite via SQLAlchemy
6. **Display**: Frontend fetches processed results via API

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
| AI         | Anthropic Claude, OpenAI |
| Auth       | Google OAuth |
| Deployment | Docker Compose, Cloudflare |
