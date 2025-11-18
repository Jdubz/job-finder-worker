# Job Finder Frontend

A modern React application for the Job Finder platform, built with React 18, TypeScript, Vite, and shadcn/ui.

## Overview

This is the dedicated frontend application for Job Finder. It provides a streamlined, professional UI for job discovery, queue management, and AI-powered job matching.

## Tech Stack

- **Framework:** React 18 + TypeScript
- **Build Tool:** Vite
- **UI Library:** shadcn/ui (blue theme)
- **Styling:** Tailwind CSS
- **Routing:** React Router v7
- **Authentication:** Firebase Auth
- **Database:** Cloud Firestore
- **Testing:** Vitest + React Testing Library
- **Linting:** ESLint (flat config) + Prettier

## Project Structure

```
src/
├── api/              # API client layer
├── components/       # Reusable components
│   └── ui/          # shadcn/ui components
├── config/          # Configuration files
├── contexts/        # React contexts (Auth, etc.)
├── features/        # Feature-based modules
├── hooks/           # Custom React hooks
├── lib/             # Utility functions
├── test/            # Test setup and utilities
└── types/           # TypeScript type definitions
```

## Getting Started

### Prerequisites

- Node.js 20+
- npm or pnpm

### Installation

```bash
npm install
```

### Environment Setup

1. Copy the environment template:

   ```bash
   cp .env.template .env
   ```

2. Fill in your Firebase configuration values in `.env`

### Development

```bash
npm run dev              # Start dev server
npm run build            # Build for production
npm run preview          # Preview production build
npm run lint             # Run ESLint
npm run lint:fix         # Auto-fix lint issues
npm run format           # Format code with Prettier
npm run format:check     # Check code formatting
npm run test             # Run unit tests
npm run test:ui          # Run tests with UI
npm run test:e2e         # Run E2E tests with Playwright
npm run test:e2e:ui      # Run E2E tests with Playwright UI
npm run test:e2e:headed  # Run E2E tests in headed mode
npm run test:e2e:debug   # Debug E2E tests
npm run type-check       # Run TypeScript type checking
```

## Environment Variables

See `.env.template` for required environment variables and setup instructions.

**Quick Start**:
```bash
# 1. Copy template
cp .env.template .env.development

# 2. Fill in Firebase credentials
# Get from: https://console.firebase.google.com/project/static-sites-257923/settings/general

# 3. Validate configuration
npm run check:env
```

**Key variables**:
- `VITE_FIREBASE_*` - Firebase SDK configuration (required)
- `VITE_API_BASE_URL` - Cloud Functions base URL (auto-configured)
- `VITE_USE_EMULATORS` - Enable Firebase emulators in development
- `VITE_ENVIRONMENT` - Environment metadata

**Documentation**:
- [Environment Troubleshooting Guide](docs/environment-troubleshooting.md) - Complete setup and debugging guide
- [Environment Verification Matrix](docs/environment-verification-matrix.md) - Known issues and fixes

### Environment Configuration

All environments use the `static-sites-257923` Firebase project:

- **Development**: Local Firebase emulators with `job-finder-dev` app config
- **Staging**: Cloud Functions with `-staging` suffix (e.g., `manageJobQueue-staging`)
- **Production**: Cloud Functions with no suffix (e.g., `manageJobQueue`)

API endpoints are automatically configured based on build mode. See `src/config/api.ts` for implementation details.

## Deployment

The application is deployed to Firebase Hosting with two environments:

- **Staging:** `job-finder-staging.joshwentworth.com`
- **Production:** `job-finder.joshwentworth.com`

Deployment is automated via GitHub Actions on branch merges.

### Deployment Resources

- [Deployment Runbook](./DEPLOYMENT_RUNBOOK.md) - Complete deployment procedures
- [GitHub Secrets Setup](./GITHUB_SECRETS_SETUP.md) - CI/CD secret configuration
- [Production Cutover Checklist](./PRODUCTION_CUTOVER_CHECKLIST.md) - Production deployment guide

## Infrastructure as Code

This project uses Terraform to manage Firebase Hosting and Cloudflare DNS infrastructure. This ensures deployments are reproducible and infrastructure changes are version-controlled.

### Infrastructure Components

- **Firebase Hosting**: Sites for staging and production
- **Cloudflare DNS**: Custom domain CNAME records
- **Google Secret Manager**: Secure configuration storage
- **IAM Permissions**: Service account access control

### Quick Start with Terraform

```bash
# Navigate to Terraform directory
cd infrastructure/terraform

# Set required credentials
export CLOUDFLARE_API_TOKEN="your-token"
gcloud auth application-default login

# Initialize Terraform
terraform init

# Create configuration file
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your Cloudflare Zone ID

# Validate configuration
terraform fmt
terraform validate

# Plan changes (review before applying)
terraform plan

# Apply changes (requires confirmation)
terraform apply
```

### Infrastructure Documentation

- [Terraform Hosting Guide](./docs/infrastructure/terraform-hosting.md) - Complete Terraform setup and usage
- [Terraform README](./infrastructure/terraform/README.md) - Quick reference guide
- Infrastructure code: `infrastructure/terraform/` directory

### Terraform CI/CD

Terraform validation runs automatically on pull requests:
- ✅ Format checking (`terraform fmt`)
- ✅ Configuration validation (`terraform validate`)
- ✅ Security scanning (Checkov)
- ✅ Dry-run planning

See `.github/workflows/terraform-validate.yml` for workflow details.

## Shared Types

This project uses `@shared/types` for type safety across frontend, backend, and Firebase Functions.

## Contributing

See the main migration plan documentation for contribution guidelines.

## Features

### Core Features

- **Job Applications:** View and manage job matches with filtering and search
- **Job Finder:** Submit LinkedIn job URLs for automated processing
- **Document Builder:** Generate AI-powered resumes and cover letters
- **Document History:** Browse, download, and manage generated documents
- **Queue Management:** Monitor job processing queue status

### Configuration Features (Editor Role Required)

- **Job Finder Config:** Configure stop lists, queue settings, and AI parameters
- **AI Prompts:** Customize AI prompts for document generation with variable interpolation
- **Settings:** Manage user preferences, theme, and default settings

### Technical Features

- Protected routes with Firebase Authentication
- Role-based access control (user/editor roles)
- Real-time Firestore updates
- Responsive design with mobile support
- Dark mode support
- Comprehensive E2E test coverage
- CI/CD pipeline with automated deployments

## API Documentation

See [API.md](./API.md) for detailed API client documentation.

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for system architecture and component diagrams.

## Related Projects

- **job-finder-BE** - Firebase Functions backend for document generation and content management
- **job-finder** - Python queue worker for job discovery and scraping
- **job-finder-shared-types** - Shared TypeScript types across all projects

## License

Private - All Rights Reserved
