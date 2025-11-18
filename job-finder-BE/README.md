# Job Finder Backend API

Firebase Cloud Functions backend for the Job Finder Application.

## Overview

This repository contains the backend API implementation for the Job Finder application, providing:

- **Job Queue Management**: API endpoints for submitting and managing job search tasks
- **Job Matches**: Storage and retrieval of job matches
- **Configuration**: System configuration management
- **Authentication**: User authentication and authorization
- **Rate Limiting**: Request rate limiting and security

## Architecture

### Technology Stack

- **Runtime**: Node.js 20
- **Framework**: Firebase Cloud Functions (2nd gen)
- **Language**: TypeScript
- **Database**: Cloud Firestore
- **Authentication**: Firebase Authentication
- **Secrets**: Google Cloud Secret Manager
- **Testing**: Jest + Firebase Functions Test

### Project Structure

```
job-finder-BE/
├── src/
│   ├── config/           # Configuration management
│   ├── middleware/       # Express middleware (CORS, rate limiting, validation)
│   ├── services/         # Business logic services
│   │   ├── firestore.service.ts
│   │   └── secret-manager.service.ts
│   ├── types/           # TypeScript type definitions
│   ├── utils/           # Utility functions
│   ├── __tests__/       # Test files
│   └── index.ts         # Cloud Functions entry point
├── dist/                # Compiled JavaScript (generated)
├── package.json         # Dependencies and scripts
├── tsconfig.json        # TypeScript configuration
├── firebase.json        # Firebase configuration
└── jest.config.js       # Jest test configuration
```

## Setup

### Prerequisites

- Node.js 20+
- npm or yarn
- Firebase CLI: `npm install -g firebase-tools`
- Access to Firebase project

### Installation

1. Clone the repository (or use the worktree):
   ```bash
   cd /home/jdubz/Development/job-finder-app-manager/worktrees/worker-a-job-finder-BE
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your configuration
   ```

4. Login to Firebase:
   ```bash
   firebase login
   ```

5. Select your Firebase project:
   ```bash
   firebase use --add
   ```

## Development

### Local Development with Emulators

This project uses the Firebase Emulator Suite for local development with **data persistence** enabled.

**Start all emulators** (Auth, Functions, Firestore, Storage):
```bash
cd functions
npm run emulators:start
```

This will:
- Build the TypeScript functions
- Start all emulators with persistence
- Import previously saved data (if available)
- Open the Emulator UI at `http://localhost:4000`

**Available emulators:**
- **Auth**: `http://localhost:9099` - User authentication and custom claims
- **Functions**: `http://localhost:5001` - Cloud Functions API
- **Firestore**: `http://localhost:8080` - Database with security rules
- **Storage**: `http://localhost:9199` - File storage
- **Emulator UI**: `http://localhost:4000` - Web dashboard

**Emulator commands:**
```bash
# Start with persistence (default)
npm run emulators:start

# Clear all persisted data and start fresh
npm run emulators:clear
npm run emulators:start

# Seed test data (users, collections)
npm run emulators:seed
```

Data persists between restarts in `.firebase/emulator-data/`.

See [docs/development/EMULATORS.md](./docs/development/EMULATORS.md) for detailed emulator guide.

### Build

Compile TypeScript to JavaScript:
```bash
npm run build
```

### Testing

The backend includes comprehensive test coverage across unit, integration, and E2E tests. Tests use Jest with Firebase Functions Test utilities and Firebase emulators.

**Run all tests:**
```bash
npm test
```

**Test with coverage report:**
```bash
npm run test:coverage

# View coverage in browser
open coverage/lcov-report/index.html
```

**Watch mode (for development):**
```bash
npm run test:watch
```

**Run specific test types:**
```bash
# Unit tests only
npm run test:unit

# Integration tests (requires emulators)
npm run test:integration

# E2E tests
npm run test:e2e

# CI mode (used in GitHub Actions)
npm run test:ci
```

**Test Structure:**
- `functions/src/__tests__/services/` - Service layer unit tests
- `functions/src/__tests__/integration/` - Integration tests with Firebase emulators
- `functions/src/__tests__/e2e/` - End-to-end workflow tests
- `functions/src/__tests__/helpers/` - Test utilities and mocks
- `functions/src/__tests__/setup.ts` - Global test configuration

**Coverage Thresholds:**
- Current: ~7% overall (incrementally improving)
- Target: >80% for services, >90% for critical business logic
- Key services already covered: firestore.service (97%), job-queue.service (45%)

**Integration tests** (requires emulators):
```bash
# Terminal 1: Start emulators
npm run emulators:start

# Terminal 2: Run integration tests
npm run test:integration
```

All tests automatically detect and connect to Firebase emulators when available.

### Linting

Check code quality:
```bash
npm run lint
```

Auto-fix issues:
```bash
npm run lint:fix
```

## Deployment

### Deployment Overview

This project uses CI/CD for automated deployments:
- **Staging**: Merge to `staging` branch triggers deployment to staging environment
- **Production**: Merge `staging` to `main` triggers deployment to production

### Deploy to Staging

Merge your changes to the `staging` branch:

```bash
git checkout staging
git merge your-branch
git push origin staging
```

GitHub Actions will automatically deploy to staging functions (manageJobQueue-staging, etc.)

### Deploy to Production

**IMPORTANT**: Always deploy to staging first and validate before production.

#### Automated Production Deployment (Recommended)

Use the deployment script for guided deployment:

```bash
./scripts/deploy-production.sh
```

This script will:
1. Confirm pre-deployment checklist
2. Run tests and build
3. Merge staging to main
4. Push to trigger CI/CD deployment

#### Manual Production Deployment

```bash
# 1. Backup production data
./scripts/backup-production.sh

# 2. Review changes
git diff main staging

# 3. Merge and deploy
git checkout main
git merge staging
git push origin main
```

### Production Deployment Validation

After deployment, run smoke tests:

```bash
./scripts/smoke-tests-production.sh
```

See [Production Deployment Guide](./docs/PRODUCTION_DEPLOYMENT.md) for detailed instructions.

### Rollback

If issues arise in production:

```bash
./scripts/rollback-production.sh
```

## API Endpoints

### Health Check

```
GET /health
```

Returns service health status.

### Job Queue (Coming Soon)

- `POST /submitJob` - Submit a new job search task
- `POST /submitScrape` - Submit a scraping task
- `POST /submitCompany` - Submit a company search task
- `GET /queue` - Get queue status
- `GET /queue/stats` - Get queue statistics

### Job Matches (Coming Soon)

- `GET /matches` - Get user's job matches
- `PUT /matches/:id` - Update a job match

### Configuration (Coming Soon)

- `GET /config` - Get system configuration
- `PUT /config` - Update system configuration

## Environment Variables

See `.env.example` for all available environment variables.

Key variables:
- `FIREBASE_PROJECT_ID` - Firebase project ID
- `GCP_PROJECT_ID` - Google Cloud project ID
- `CORS_ALLOWED_ORIGINS` - Allowed CORS origins
- `LOG_LEVEL` - Logging level (debug, info, warn, error)

## Security

See:
- `docs/security/security-policy.md` — Reporting process, hardening standards, and incident response.
- `docs/security/index-verification.md` — Firestore rules and index verification workflow.

### Secrets Management

Secrets are stored in Google Cloud Secret Manager:
1. Create secrets in GCP Console or using `gcloud` CLI
2. Grant Cloud Functions service account access to secrets
3. Reference secrets in function configuration

### CORS

CORS is configured to only allow requests from whitelisted origins.
Update `CORS_ALLOWED_ORIGINS` in environment variables.

### Rate Limiting

Rate limiting is applied to all endpoints to prevent abuse.
Default: 100 requests per 15 minutes per IP.

### Authentication

Functions requiring authentication validate Firebase ID tokens.
Include token in Authorization header: `Bearer <token>`

## Monitoring

### Logs

View function logs:
```bash
npm run logs
```

Or in Firebase Console:
- https://console.firebase.google.com/project/<project-id>/functions/logs

### Metrics

Monitor function performance in:
- Firebase Console > Functions
- Google Cloud Console > Cloud Functions

### Structured Logging

- Review `docs/operations/structured-logging.md` for backend log format, required environment variables, and deployment steps.
- Cross-repo architecture docs live in the shared submodule at `docs/shared/job-finder-docs/docs/architecture/structured-logging-overview.md`.

## CI/CD

### Workflows

The repository uses two GitHub Actions workflows:

1. **CI Pipeline** (`.github/workflows/ci.yml`)
   - Runs on all branches and pull requests
   - Executes: lint, test, build
   - Required to pass before merge

2. **Deployment Pipeline** (`.github/workflows/deploy-functions.yml`)
   - Deploys to staging on push to `staging` branch
   - Deploys to production on push to `main` branch
   - Uses workload identity federation (no service account keys)
   - Deploys only changed functions for efficiency

### CI Troubleshooting

**Deployment fails with authentication error:**
- Check that GitHub repository has workload identity bindings configured
- Verify the service account exists: `github-actions-deployer@static-sites-257923.iam.gserviceaccount.com`
- Confirm GitHub environments are set up: `staging`, `production`

**Functions not deploying:**
- Verify changes are in `functions/**` directory
- Check that the workflow file path filter matches your changes
- Review deployment logs in GitHub Actions

**Build or test failures:**
- Run locally: `npm ci && npm run lint && npm test && npm run build`
- Check that Node.js version matches (20)
- Ensure all dependencies are in `package.json`

**Permissions errors:**
- The deployment uses workload identity, not service account keys
- No GitHub secrets are required for deployment (only for local dev)
- See `CICD_REVIEW.md` for detailed IAM setup documentation

For detailed pipeline documentation, see:
- `CICD_REVIEW.md` - Comprehensive pipeline review and troubleshooting
- `.github/workflows/README.md` - Workflow-specific documentation (if exists)

## Contributing

### Workflow

1. Work in your dedicated worktree: `worktrees/worker-a-job-finder-BE`
2. Work on your branch: `worker-a-job-finder-BE`
3. Sync with staging: `git pull origin staging`
4. Make changes and commit
5. Push to your branch
6. Create PR to `staging` branch
7. After PR approval, PM merges to staging

### Code Standards

- Follow TypeScript/ESLint rules
- Write tests for new features
- Document all functions
- Use meaningful commit messages
- Reference issue numbers in commits

## Troubleshooting

### Common Issues

**Functions not deploying:**
- Check Firebase project is selected: `firebase use`
- Verify you have deployment permissions
- Check build succeeds: `npm run build`

**Emulator not starting:**
- Check port 5001 is available
- Verify Firebase tools installed: `firebase --version`
- Check logs for errors

**Type errors:**
- Run `npm install` to ensure all types are installed
- Check `tsconfig.json` settings

## Migration Notes

This repository was created by migrating Cloud Functions from the Portfolio project:
- Shared infrastructure (config, middleware, utils, services) copied from portfolio
- Job-specific functionality implemented new for job-finder
- Updated dependencies to latest versions
- Improved project structure and documentation

## Support

For issues, questions, or feature requests:
1. Check existing GitHub issues in manager repo
2. Create new issue with detailed description
3. Tag appropriate team members

## License

[License Type] - See LICENSE file for details
