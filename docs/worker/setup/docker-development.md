> Status: Active
> Owner: @jdubz
> Last Updated: 2025-11-25

# Worker Docker Development Guide

## Overview

The worker service runs in a Docker container during development for isolation and consistency. The source code is mounted from your local directory, allowing you to edit files and see changes immediately.

## Quick Start

```bash
# Start all services (worker runs in Docker)
make dev-ui

# Or start just the worker in Docker
make worker-docker-up
```

## Architecture

- **Source Code**: Mounted from `job-finder-worker/` directory (read-write)
- **Logs**: Written to `job-finder-worker/logs/` (visible on host)
- **Config**: `job-finder-worker/config/` (editable on host)
- **Credentials**: `job-finder-worker/.firebase/` (read-only)

## Common Commands

### Starting & Stopping

```bash
# Start worker in Docker (builds if needed)
make worker-docker-up

# Stop worker
make worker-docker-down

# Restart worker (after code changes)
make worker-docker-restart
```

### Viewing Logs

```bash
# Follow logs in real-time
make worker-docker-logs

# Or view directly from tmux pane when using dev-ui
```

### Debugging

```bash
# Enter container shell for debugging
make worker-docker-shell

# Inside container, you can:
python run_job_search.py          # Run job search
python run_search.py               # Run basic search
pip list                           # View installed packages
ls -la /app/src                    # Check mounted source code
```

### Rebuilding

```bash
# Rebuild after dependency changes (requirements.txt)
make worker-docker-rebuild
```

## Development Workflow

### 1. Standard Development (with tmux)

```bash
# Start all services in tmux panes
make dev-ui

# Now you have 4 panes:
# - Top-left: Firebase Emulators
# - Top-right: Backend (Cloud Functions)
# - Bottom-left: Frontend (Vite)
# - Bottom-right: Worker (Docker)

# Navigate between panes: Ctrl+B then arrow keys
# Zoom into a pane: Ctrl+B then z
# Detach from tmux: Ctrl+B then d
```

### 2. Edit Code

Edit any Python file in `job-finder-worker/src/`:

- Changes are immediately visible in container (mounted volume)
- No need to rebuild for code changes
- Only rebuild if you change `requirements.txt`

### 3. See Changes

```bash
# If using dev-ui (tmux):
# - Switch to worker pane (Ctrl+B then arrows)
# - The container auto-restarts on code changes

# If running worker separately:
make worker-docker-restart
make worker-docker-logs
```

### 4. Debug Issues

```bash
# Enter container shell
make worker-docker-shell

# Inside container:
cd /app
python -c "import sys; print(sys.path)"
pip list | grep dotenv
python run_job_search.py
```

## Tmux Navigation Shortcuts

When using `make dev-ui`:

| Shortcut             | Action                                      |
| -------------------- | ------------------------------------------- |
| `Ctrl+B` then `←↑↓→` | Switch between panes                        |
| `Ctrl+B` then `z`    | Zoom in/out of current pane                 |
| `Ctrl+B` then `d`    | Detach (keeps services running)             |
| `Ctrl+B` then `x`    | Kill current pane                           |
| `Ctrl+B` then `[`    | Scroll mode (arrows to scroll, `q` to exit) |

To reconnect after detaching:

```bash
tmux attach -t job-finder
```

To kill the entire session:

```bash
tmux kill-session -t job-finder
```

## Docker Compose Details

The worker uses `docker-compose.dev.yml`:

```yaml
services:
  job-finder:
    build:
      dockerfile: Dockerfile.dev
    volumes:
      - ./src:/app/src:rw # Source code (editable)
      - ./config:/app/config:rw # Config files (editable)
      - ./logs:/app/logs # Log output
      - ./.firebase:/app/credentials:ro # Firebase credentials
    environment:
      - PYTHONUNBUFFERED=1 # See logs immediately
      - ENVIRONMENT=local-dev
      - PROFILE_DATABASE_NAME=portfolio-staging
```

## Troubleshooting

### Container won't start

```bash
# View detailed logs
cd job-finder-worker
docker-compose -f docker-compose.dev.yml logs

# Rebuild from scratch
make worker-docker-rebuild
```

### Changes not appearing

```bash
# Restart container
make worker-docker-restart

# Verify volume mount
make worker-docker-shell
ls -la /app/src  # Should show your local files
```

### Missing dependencies

```bash
# Rebuild after updating requirements.txt
make worker-docker-rebuild
```

### Port conflicts

If Docker complains about ports in use:

```bash
# Stop all Docker containers
docker stop $(docker ps -aq)

# Or just stop the worker
make worker-docker-down
```

## Environment Variables

The worker container reads from:

1. `job-finder-worker/.env` file (if exists)
2. Host environment variables (via docker-compose)

Required:

- `ANTHROPIC_API_KEY` - Claude API key
- `OPENAI_API_KEY` - OpenAI API key (optional)
