# Job Finder Worker

The Python worker/scraper now runs alongside the rest of the stack in this monorepo. All reference material (queue design, runbooks, scheduler docs, etc.) lives under [`docs/worker/`](../docs/worker/README.md). Follow the [documentation guidelines](../docs/DOCUMENTATION_GUIDELINES.md) for any new notes instead of keeping files here.

## Commands

```bash
# create a venv and install deps
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt -r requirements-test.txt

# run the targeted CI test set (same command the git hooks call)
make test-ci

# run everything (slow)
make test

# queue-first job search (enqueues SCRAPE and processes queue; reads settings from SQLite job_finder_config)
python run_job_search_unified.py --max-jobs 20
```

The worker now expects `SQLITE_DB_PATH` (or `infra/sqlite/jobfinder.db` inside the repo) and reuses the shared queue schema/types that ship from the root `shared/` workspace. Use the root Husky hooks + CI workflows for lint/test enforcement.

## Queue live updates (Node API bridge)

To stream queue status to the Node backend and receive cancel commands in real time:

```bash
export SQLITE_DB_PATH=./infra/sqlite/jobfinder.db
export JF_NODE_API_BASE=http://localhost:8080/api
export JF_WORKER_WS_TOKEN=local-worker-secret   # must match server WORKER_WS_TOKEN
export JF_NODE_API_TOKEN=local-worker-secret     # used for HTTP fallback and WS auth header
export JF_WORKER_ID=default
python src/job_finder/flask_worker.py
```

The worker will:
- open a WebSocket to `/worker/stream`
- send queue events/heartbeats over WS (HTTP POST fallback if WS drops)
- receive `command.cancel` over WS and mark items skipped; if WS is down, it polls `/queue/worker/commands` as a fallback.
