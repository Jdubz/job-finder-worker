# Data Directory

**This directory is gitignored and should contain personal/sensitive data files.**

## Purpose

The `data/` directory stores personal data exports, portfolio information, and other sensitive files that should **NOT** be committed to the public GitHub repository.

## Directory Structure

```
data/
├── content-items/          # Content items exports (work history, projects, etc.)
├── portfolio-exports/      # Portfolio data exports
├── firestore-exports/      # Firestore database exports
│   ├── portfolio/         # Production portfolio data
│   └── portfolio-staging/ # Staging portfolio data
└── README.md              # This file
```

## What Goes Here

### Personal Data Files:
- Work history and experience data
- Personal biography and contact information
- Portfolio project descriptions
- Resume/CV data
- Any JSON exports containing personal information

### Sensitive Configuration:
- Local development data
- Test data with real personal information
- Database exports from production

## What Should NOT Go Here

- Code or source files (belongs in `src/`, `lib/`, etc.)
- Public documentation (belongs in `docs/`)
- Configuration templates (belongs in `config/` or repo root)
- Test fixtures with fake/anonymous data (belongs in `tests/fixtures/`)

## Usage

### Content Items
```bash
# Import cleaned content items
node scripts/import-clean-content-items.js \
  --input data/content-items/content-items-clean.json \
  --db /srv/job-finder/data/jobfinder.db \
  --user-email your@email.com
```

### Firestore Exports
```bash
# Export from Firestore
npm run export:firestore --workspace infra/sqlite/seeders

# Exports will be saved to data/firestore-exports/
```

## Security

- ✓ This directory is in `.gitignore`
- ✓ No files here will be committed to the repository
- ✓ Safe to store personal and sensitive data locally
- ⚠️ Do not move files from `data/` back into tracked directories
- ⚠️ Do not add exceptions to `.gitignore` for specific data files

## Migration from Old Locations

**These files have been moved here from tracked locations:**

- `docs/content-items-export.json` → `data/content-items/`
- `docs/content-items-clean.json` → `data/content-items/`
- `infra/sqlite/seeders/output/portfolio/` → `data/firestore-exports/portfolio/`
- `infra/sqlite/seeders/output/portfolio-staging/` → `data/firestore-exports/portfolio-staging/`

If you have old branches, these files may still exist in tracked locations. Always use the `data/` directory going forward.
