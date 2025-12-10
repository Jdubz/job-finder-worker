# Environment Variable Reference

> Status: Active
> Owner: @jdubz
> Last Updated: 2025-12-09

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

**API keys for AI providers (optional - depends on interface type).**

API keys are only needed when using "api" interface providers in the `ai-settings` config.
CLI-based providers use OAuth credentials instead:
- `codex/cli` - Uses `~/.codex/auth.json` (via `codex login`)
- `gemini/cli` - Uses `~/.gemini/oauth_creds.json` (via `gemini auth login`)

If you configure an API interface without the required key, the system will automatically
fall back to CLI interface when available (e.g., `gemini/api` → `gemini/cli`).

- `ANTHROPIC_API_KEY` - Anthropic Claude API key (only for `claude/api`)
- `OPENAI_API_KEY` - OpenAI API key (only for `openai/api`)
- `GOOGLE_API_KEY` or `GEMINI_API_KEY` - Google Gemini API key (only for `gemini/api`)

## Frontend Configuration

**Vite environment variables (must be prefixed with `VITE_`).**

- `VITE_API_BASE_URL` - Base URL for API requests
- `VITE_GOOGLE_CLIENT_ID` - Google OAuth client ID (frontend)
- `VITE_ENVIRONMENT` - Environment name (development, staging, production)
- `VITE_SENTRY_DSN` - Sentry error tracking DSN

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
ANTHROPIC_API_KEY=your-anthropic-key
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
# API keys only needed if using api interfaces (not cli interfaces)
# ANTHROPIC_API_KEY=your-anthropic-key  # Only for claude/api
# OPENAI_API_KEY=your-openai-key        # Only for openai/api
# GOOGLE_API_KEY=your-gemini-key        # Only for gemini/api
# CLI-only auth
# CLAUDE_CODE_OAUTH_TOKEN=your-claude-code-token
```

## Configuration Management

Store environment variables in:

- `.env` file for local development (gitignored)
- GitHub Secrets for CI/CD workflows
- Docker Compose environment files for production

Never commit secrets to version control.
