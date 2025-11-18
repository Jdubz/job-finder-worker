# Job Finder FE Documentation

Central index for the frontend documentation set.

## Quick Links

- `development/structured-logging.md` — Browser logging implementation and App Monitor integration.
- `operations/AUTH_DEBUGGING_GUIDE.md` — Troubleshooting Firebase Auth flows.
- `operations/QUICK_AUTH_FIX.md` — Emergency patch for auth regressions.
- `environment-verification-matrix.md` — Source of truth for environment configuration.
- `TESTING.md` (repo root) — Frontend testing strategy and Vitest setup.

## Directory Overview

```
docs/
├── architecture/        # System diagrams, API contracts
├── development/         # Frontend development runbooks (incl. structured logging)
├── operations/          # Incident response and fixes
├── environment-*.md     # Environment-specific guidance
└── README.md            # This file
```

Shared documentation is available under `docs/shared/job-finder-docs/` for cross-repo architecture references.

Add new documentation to the appropriate subdirectory and update this index so other teams can find it quickly.
