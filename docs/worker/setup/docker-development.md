> Status: Active
> Owner: @jdubz
> Last Updated: 2025-11-25

# Worker Docker Development Guide

Development environment that mirrors production as closely as possible. Uses Docker with hot reload, a cloned production database, and a test harness for queue interactions.

## Quick Start

```bash
# 1. Setup local dev environment (creates .dev/ directories)
make dev-setup

# 2. Clone production database
make dev-clone-db PROD_DB=/path/to/jobfinder.db
# Or from remote server:
make dev-clone-db-scp SCP_SRC=user@server:/srv/job-finder/data/jobfinder.db

# 3. Build and start
make dev-build
make dev-up

# 4. Watch logs (hot reload active)
make dev-logs
```

## Directory Structure

After setup, the `.dev/` directory (gitignored) mirrors production:

```
.dev/
├── data/              # SQLite database (cloned from prod)
│   └── jobfinder.db
├── config/            # Configuration files
├── logs/              # Worker logs
└── worker-data/       # Temp worker data
```

## Hot Reload

The dev container uses `watchdog` to monitor `src/` for Python file changes. Edit any `.py` file and the worker automatically restarts within seconds.

No manual restart needed for code changes.

## Commands Reference

### Setup & Database

| Command | Description |
|---------|-------------|
| `make dev-setup` | Create `.dev/` directory structure |
| `make dev-clone-db PROD_DB=...` | Clone production database from local path |
| `make dev-clone-db-scp SCP_SRC=...` | Clone production database via SCP |

### Docker Control

| Command | Description |
|---------|-------------|
| `make dev-build` | Build dev Docker image |
| `make dev-up` | Start container (detached) |
| `make dev-up-attached` | Start container (see logs inline) |
| `make dev-down` | Stop container |
| `make dev-restart` | Restart container |
| `make dev-logs` | Tail worker logs |
| `make dev-shell` | Shell into container |
| `make dev-sqlite` | Open SQLite CLI for dev database |

### Test Harness

| Command | Description |
|---------|-------------|
| `make dev-test-status` | Show queue status |
| `make dev-test-watch` | Watch queue for changes |
| `make dev-test-all` | Run all test scenarios |
| `make dev-test-job URL=...` | Submit a job URL for processing |
| `make dev-test-company NAME=...` | Submit a company for analysis |
| `make dev-test-clear` | Clear test items from queue |

### Cleanup

| Command | Description |
|---------|-------------|
| `make dev-clean` | Clean logs/temp data (keeps database) |
| `make dev-clean-all` | Remove entire `.dev/` directory |

## Development Workflow

### 1. Start Environment

```bash
make dev-up
make dev-logs  # In a separate terminal
```

### 2. Edit Code

Edit files in `src/`. Changes auto-reload via watchdog.

### 3. Test Queue Processing

```bash
# Submit a test job
make dev-test-job URL=https://boards.greenhouse.io/company/jobs/12345

# Watch for status changes
make dev-test-watch

# Check queue status
make dev-test-status
```

### 4. Inspect Database

```bash
make dev-sqlite

# Inside sqlite:
.tables
SELECT * FROM job_queue ORDER BY created_at DESC LIMIT 10;
SELECT * FROM job_matches ORDER BY created_at DESC LIMIT 5;
```

### 5. Debug in Container

```bash
make dev-shell

# Inside container:
python -c "from job_finder.storage.sqlite_client import get_connection; print(get_connection())"
```

## Test Harness CLI

The test harness (`dev/test_harness.py`) provides direct queue manipulation:

```bash
# Submit items
python dev/test_harness.py job https://example.com/job/123 --watch
python dev/test_harness.py company "Acme Corp" --url https://acme.com --watch
python dev/test_harness.py discover "Stripe" --url https://stripe.com

# Monitor
python dev/test_harness.py status
python dev/test_harness.py watch
python dev/test_harness.py watch-item <tracking-id>

# Cleanup
python dev/test_harness.py clear
```

## Troubleshooting

### Database not found

```bash
make dev-clone-db PROD_DB=/path/to/jobfinder.db
make dev-restart
```

### Worker not starting

```bash
docker compose -f docker-compose.dev.yml logs worker
```

### Hot reload not working

Ensure you're editing files in `src/` on the host (not inside the container). The volume mount maps `./src` to `/app/src`.

### Port 5555 in use

Edit `docker-compose.dev.yml` to change the port mapping, or stop the conflicting process.

### Missing API keys

Ensure `.env` contains `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`.

## Environment Variables

Set in `docker-compose.dev.yml`:

| Variable | Default | Description |
|----------|---------|-------------|
| `ENVIRONMENT` | development | Environment name |
| `POLL_INTERVAL` | 10 | Queue poll interval (faster for dev) |
| `LOG_LEVEL` | DEBUG | Logging verbosity |
| `ENABLE_HOT_RELOAD` | true | Enable watchdog file monitoring |

API keys loaded from `.env`:
- `ANTHROPIC_API_KEY` - Required for AI processing
- `OPENAI_API_KEY` - Alternative AI provider
