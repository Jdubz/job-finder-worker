# Environment Variable Reference

> Status: Active
> Owner: @jdubz
> Last Updated: 2025-11-25

This document consolidates the environment variables for the job-finder-bot. Replace secrets through your secure secret management workflow; do not commit plaintext secrets.

## GitHub Configuration

**Required for GitHub integration and repository access.**

- `GITHUB_OWNER` - GitHub organization or username
- `GITHUB_REPO` - Repository name
- `GITHUB_TOKEN` - Personal access token with repo permissions

## Project Management

**Team member configuration and project identification.**

- `PM_EMAIL` - Project manager email
- `PROJECT_NAME` - Project identifier
- `WORKER_A_EMAIL` - Worker A email
- `WORKER_B_EMAIL` - Worker B email

## Firebase Configuration

**Firebase service account credentials for Firestore and authentication.**

- `FIREBASE_AUTH_PROVIDER_X509_CERT_URL` - Auth provider certificate URL
- `FIREBASE_AUTH_URI` - Authentication URI
- `FIREBASE_CLIENT_EMAIL` - Service account email
- `FIREBASE_CLIENT_ID` - Client identifier
- `FIREBASE_CLIENT_X509_CERT_URL` - Client certificate URL
- `FIREBASE_PRIVATE_KEY` - Service account private key (base64 encoded)
- `FIREBASE_PRIVATE_KEY_ID` - Private key identifier
- `FIREBASE_PROJECT_ID` - Firebase project ID
- `FIREBASE_TOKEN_URI` - Token exchange URI

## Database Configuration

**PostgreSQL or other database connection settings.**

- `DATABASE_HOST` - Database server hostname
- `DATABASE_NAME` - Database name
- `DATABASE_PASSWORD` - Database password
- `DATABASE_PORT` - Database port (default: 5432)
- `DATABASE_URL` - Full connection string (alternative to individual settings)
- `DATABASE_USER` - Database username

## API Configuration

**External API credentials and endpoints.**

- `API_BASE_URL` - Base URL for API requests
- `API_KEY` - API key for authentication
- `API_SECRET` - API secret for signing requests

## Notification Services

**Alert and notification delivery channels.**

- `DISCORD_WEBHOOK_URL` - Discord webhook for notifications
- `EMAIL_SMTP_HOST` - SMTP server hostname
- `EMAIL_SMTP_PASSWORD` - SMTP authentication password
- `EMAIL_SMTP_PORT` - SMTP server port (default: 587)
- `EMAIL_SMTP_USER` - SMTP authentication username
- `SLACK_WEBHOOK_URL` - Slack webhook for notifications

## Monitoring and Observability

**Application performance monitoring and error tracking.**

- `NEW_RELIC_LICENSE_KEY` - New Relic APM license key
- `SENTRY_DSN` - Sentry error tracking DSN

## AI/LLM Services

**Anthropic and OpenAI API credentials.**

- `ANTHROPIC_API_KEY` - Anthropic Claude API key
- `OPENAI_API_KEY` - OpenAI API key

## Security

**Encryption and authentication secrets.**

- `ENCRYPTION_KEY` - Application encryption key
- `JWT_SECRET` - JSON Web Token signing secret
- `SESSION_SECRET` - Session cookie secret

## Development and Runtime

**Environment-specific configuration.**

- `DEBUG` - Enable debug mode (true/false)
- `LOG_LEVEL` - Logging verbosity (debug, info, warn, error)
- `NODE_ENV` - Runtime environment (development, production, test)

## Configuration Management

Store environment variables in:

- `.env` file for local development (gitignored)
- GitHub Secrets for CI/CD workflows
- Cloud provider secret managers for production (AWS Secrets Manager, Google Secret Manager, etc.)

Never commit secrets to version control.
