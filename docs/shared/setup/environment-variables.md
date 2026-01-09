# Environment Variable Reference

> Status: Active
> Owner: @jdubz
> Last Updated: 2026-01-09

This document consolidates the environment variables for the job-finder-bot. Replace secrets through your secure secret management workflow; do not commit plaintext secrets.

## Core Application

**Required for all services.**

- `NODE_ENV` - Runtime environment (development, production, test)
- `PORT` - API server port (default: 8080)
- `LOG_LEVEL` - Logging verbosity (debug, info, warn, error)

## Database Configuration

**SQLite database settings.**

- `SQLITE_PATH` - Path to SQLite database file (default: `./data/sqlite/jobfinder.db`)

## Authentication

**Google OAuth configuration.**

- `GOOGLE_CLIENT_ID` - Google OAuth client ID for authentication

## AI/LLM Services

**Supported agents:**
- `claude.cli` - Claude Code CLI (requires `CLAUDE_CODE_OAUTH_TOKEN`)
- `gemini.api` - Google Gemini API (requires `GOOGLE_API_KEY` or `GEMINI_API_KEY`)

**Environment variables:**

- `CLAUDE_CODE_OAUTH_TOKEN` - OAuth token for Claude Code CLI (required for `claude.cli` agent)
- `GOOGLE_API_KEY` or `GEMINI_API_KEY` - Google Gemini API key (required for `gemini.api` agent)

## Frontend Configuration

**Vite environment variables (must be prefixed with `VITE_`).**

- `VITE_API_BASE_URL` - Base URL for API requests
- `VITE_GOOGLE_CLIENT_ID` - Google OAuth client ID (frontend)
- `VITE_ENVIRONMENT` - Environment name (development, staging, production)
- `VITE_SENTRY_DSN` - Sentry error tracking DSN

## Job Applicator Configuration

**Electron desktop app settings.**

- `JOB_FINDER_API_URL` - Backend API URL (default: `http://localhost:3000/api`)
- `JOB_FINDER_FRONTEND_URL` - Frontend URL for OAuth login popup (derived from API URL if not set)
- `JOB_FINDER_SKIP_AUTH` - Skip OAuth authentication for local development (`true` or `1`). Use when running with local backend that bypasses auth for private IPs. **Do not use in production.**
- `GENERATOR_ARTIFACTS_DIR` - Local directory for generated documents (if unset, downloads from API)

## Worker Configuration

**Python worker specific settings.**

- `SELENIUM_HEADLESS` - Run browser in headless mode (true/false)
- `SCRAPE_DELAY` - Delay between scrape requests (seconds)

## Infrastructure

**Deployment and infrastructure settings.**

- `CLOUDFLARE_TUNNEL_TOKEN` - Cloudflare tunnel authentication token

## Monitoring and Observability

**Application performance monitoring and error tracking.**

- `SENTRY_DSN` - Sentry error tracking DSN (backend)

## GitHub Configuration

**Required for GitHub integration and repository access.**

- `GITHUB_OWNER` - GitHub organization or username
- `GITHUB_REPO` - Repository name
- `GITHUB_TOKEN` - Personal access token with repo permissions

## Example Configuration Files

### API (.env)

```env
NODE_ENV=development
PORT=8080
LOG_LEVEL=debug
SQLITE_PATH=../data/sqlite/jobfinder.db
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_API_KEY=your-gemini-api-key
CLAUDE_CODE_OAUTH_TOKEN=your-claude-oauth-token
SENTRY_DSN=your-sentry-dsn
```

### Frontend (.env)

```env
VITE_API_BASE_URL=http://localhost:8080
VITE_GOOGLE_CLIENT_ID=your-google-client-id
VITE_ENVIRONMENT=development
VITE_SENTRY_DSN=your-sentry-dsn
```

### Worker (.env)

```env
SQLITE_PATH=/data/sqlite/jobfinder.db
LOG_LEVEL=INFO
SELENIUM_HEADLESS=true
# AI agent credentials
CLAUDE_CODE_OAUTH_TOKEN=your-claude-oauth-token  # For claude.cli
GOOGLE_API_KEY=your-gemini-api-key               # For gemini.api
```

### Job Applicator (.env)

```env
# For local development with local prod backend
JOB_FINDER_API_URL=http://localhost:3000/api
JOB_FINDER_SKIP_AUTH=true
GENERATOR_ARTIFACTS_DIR=/srv/job-finder/artifacts

# For production backend (remote)
# JOB_FINDER_API_URL=https://job-finder-api.joshwentworth.com
# JOB_FINDER_FRONTEND_URL=https://job-finder.joshwentworth.com
```

## Configuration Management

Store environment variables in:

- `.env` file for local development (gitignored)
- GitHub Secrets for CI/CD workflows
- Docker Compose environment files for production

Never commit secrets to version control.
