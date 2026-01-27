> Status: Active
> Owner: @jdubz
> Last Updated: 2026-01-27

# Job Finder Documentation

Documentation for the Job Finder application - a containerized monorepo with Express API, React frontend, and Python worker.

## Quick Links

- **[System Architecture](./shared/architecture/system-overview.md)** - Overview of the application architecture
- **[Development Setup](./infrastructure/setup/development-stack.md)** - How to run locally
- **[Quick Reference](./infrastructure/setup/quick-reference.md)** - Common commands
- **[Migration History](./shared/MIGRATION_HISTORY.md)** - Firestore to SQLite migration details

## Documentation Structure

```
docs/
├── shared/              # Cross-service documentation
│   ├── architecture/    # System-wide architecture
│   ├── playbooks/       # Cross-service operations
│   └── setup/           # Shared configuration
├── infrastructure/      # Infra, deployment, DevOps
│   ├── architecture/    # Infrastructure design
│   ├── playbooks/       # Operational runbooks
│   └── setup/           # Environment setup
├── frontend/            # Frontend (React) docs
│   ├── playbooks/       # Frontend operations
│   └── setup/           # Frontend development
├── backend/             # Backend (Express) docs
│   └── setup/           # Backend development
└── worker/              # Worker (Python) docs
    ├── architecture/    # Worker design
    └── setup/           # Worker development
```

## Key Documents

### Architecture
- [System Overview](./shared/architecture/system-overview.md) - High-level architecture
- [Orchestration](./infrastructure/architecture/orchestration.md) - Development environment

### Development
- [Development Stack](./infrastructure/setup/development-stack.md) - Full dev guide
- [Environment Variables](./shared/setup/environment-variables.md) - Configuration reference
- [Environment Parity](./infrastructure/setup/environment-parity-checklist.md) - Env comparison

### Operations
- [Deployment Checklist](./frontend/playbooks/deployment-checklist.md) - Production deployment
- [Monitoring Setup](./infrastructure/playbooks/monitoring-setup.md) - Observability

### Testing
- [Backend Testing](./backend/setup/testing-guide.md)
- [Frontend Testing](./frontend/setup/testing-guide.md)
- [Worker Testing](./worker/setup/testing-guide.md)

## Technology Stack

| Component | Technology |
|-----------|------------|
| Frontend  | React, TypeScript, Vite, TailwindCSS |
| Backend   | Express.js, TypeScript |
| Database  | SQLite (better-sqlite3, SQLAlchemy) |
| Worker    | Python, Flask, Selenium |
| AI        | Anthropic Claude, OpenAI |
| Auth      | Google OAuth |
| Deploy    | Docker Compose, Cloudflare Tunnel |

## Contributing to Documentation

See [DOCUMENTATION_GUIDELINES.md](./DOCUMENTATION_GUIDELINES.md) for standards on creating and maintaining documentation.
