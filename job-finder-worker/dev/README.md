# Development Tools

This folder contains development and testing utilities for the job-finder-worker.

## Directory Structure

```
dev/
├── README.md              # This file
├── bin/                   # Executable scripts for dev workflows
│   └── run_search.py      # State-driven job search entry point
├── harness/               # Test harness for queue simulation
│   └── test_harness.py    # Submit and monitor queue items
├── setup/                 # Environment setup scripts
│   └── setup-dev-env.sh   # Initialize .dev/ directory structure
└── testing/               # Testing utilities
    └── safe_test_runner.py # Resource-controlled test runner
```

## Quick Start

```bash
# 1. Setup dev environment (creates .dev/ directory)
make dev-setup

# 2. Clone production database (choose one)
make dev-clone-db PROD_DB=/path/to/jobfinder.db
# or
make dev-clone-db-scp SCP_SRC=user@host:/path/to/jobfinder.db

# 3. Build and start Docker containers
make dev-build
make dev-up

# 4. Monitor the worker
make dev-logs
```

---

## Tools Reference

### bin/run_search.py

**Purpose:** State-driven job search entry point that enqueues a SCRAPE request and processes the queue until work is exhausted.

**Usage:**
```bash
# From worker root directory
python dev/bin/run_search.py --max-jobs 10 --mode full

# Options:
#   --max-jobs N      Override max jobs to enqueue/analyze (default: 10)
#   --mode full|quick Output mode: 'full' (detailed) or 'quick' (summary)
#   --no-env          Skip loading .env file
#   --queue-limit N   Max queue items to process (default: 200)
```

**Environment Variables:**
- `JF_SQLITE_DB_PATH` - Path to SQLite database (required)
- `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` - AI provider credentials

---

### harness/test_harness.py

**Purpose:** Interactive test harness for simulating production queue interactions. Allows submitting test items and monitoring their processing.

**Usage:**
```bash
# Show queue status
python dev/harness/test_harness.py status

# Submit a job URL for processing
python dev/harness/test_harness.py job https://example.com/job/12345 --watch

# Submit a company for analysis
python dev/harness/test_harness.py company "Acme Corp" --url https://acme.com --watch

# Submit a scrape request
python dev/harness/test_harness.py scrape --source greenhouse --company "Acme Corp"

# Submit source discovery request
python dev/harness/test_harness.py discover "Example Corp" --url https://example.com

# Watch queue for changes
python dev/harness/test_harness.py watch --interval 5

# Watch specific item
python dev/harness/test_harness.py watch-item <tracking_id> --timeout 300

# Run all test scenarios
python dev/harness/test_harness.py test-all

# Clear all test items from queue
python dev/harness/test_harness.py clear
```

**Makefile Shortcuts:**
```bash
make dev-test-status        # Show queue status
make dev-test-watch         # Watch queue processing
make dev-test-all           # Run all test scenarios
make dev-test-job URL=...   # Submit test job
make dev-test-company NAME=...  # Submit test company
make dev-test-clear         # Clear test items
```

---

### setup/setup-dev-env.sh

**Purpose:** Initialize the local development environment by creating the `.dev/` directory structure and optionally cloning the production database.

**Usage:**
```bash
# Create directories only (no database)
./dev/setup/setup-dev-env.sh --skip-db

# Clone from local path
./dev/setup/setup-dev-env.sh --prod-db-path /path/to/jobfinder.db

# Clone via SCP from remote server
./dev/setup/setup-dev-env.sh --scp user@host:/srv/job-finder/data/jobfinder.db

# Clean and recreate
./dev/setup/setup-dev-env.sh --clean --prod-db-path /path/to/db
```

**Created Structure:**
```
.dev/
├── config/        # Local config overrides
├── data/          # SQLite database (jobfinder.db)
├── logs/          # Worker logs
└── worker-data/   # Runtime data
```

---

### testing/safe_test_runner.py

**Purpose:** Resource-controlled test runner that prevents test explosions through process locking and resource limits.

**Features:**
- Process locking (only one test run at a time)
- Memory monitoring (default: 2GB limit)
- Execution time limits (default: 10 minutes)
- Automatic cleanup of stale locks

**Usage:**
```bash
# From worker root directory
python dev/testing/safe_test_runner.py
```

**Configuration (in script):**
- `MAX_MEMORY_MB = 2048` - Maximum memory in MB
- `MAX_EXECUTION_TIME = 600` - Maximum runtime in seconds
- `STALE_LOCK_THRESHOLD = 900` - Lock considered stale after 15 minutes

---

## Related Files

### Runtime Data (.dev/)

The `.dev/` directory contains runtime data and is git-ignored:
- `.dev/data/jobfinder.db` - Development database
- `.dev/logs/worker.log` - Worker logs
- `.dev/config/logging.yaml` - Logging configuration

### Production Scripts (scripts/)

The `scripts/` folder contains production-related scripts:
- `scripts/workers/queue_worker.py` - Docker container queue processor
- `scripts/smoke/queue_pipeline_smoke.py` - Smoke test runner

### Root Shell Scripts

- `run_dev.sh` - Start Flask worker in development mode
- `run_prod.sh` - Start Flask worker in production mode

---

## Workflow Examples

### Testing a New Queue Feature

1. Start the dev environment:
   ```bash
   make dev-up
   ```

2. Submit test items:
   ```bash
   make dev-test-job URL="https://boards.greenhouse.io/company/jobs/123"
   ```

3. Watch processing:
   ```bash
   make dev-test-watch
   ```

4. Check results:
   ```bash
   make dev-test-status
   ```

### Running Full Test Suite Safely

```bash
python dev/testing/safe_test_runner.py
```

### Quick Search Test

```bash
# Set environment and run search
export JF_SQLITE_DB_PATH=.dev/data/jobfinder.db
python dev/bin/run_search.py --max-jobs 5 --mode quick
```
