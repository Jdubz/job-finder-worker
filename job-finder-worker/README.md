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
```

The worker now expects `JF_SQLITE_DB_PATH` (or `infra/sqlite/jobfinder.db` inside the repo) and reuses the shared queue schema/types that ship from the root `shared/` workspace. Use the root Husky hooks + CI workflows for lint/test enforcement.
