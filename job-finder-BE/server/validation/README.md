# Generator Validation Harness

Validate the resume / cover-letter generation pipeline locally while matching production as closely as possible. Everything here stays inside the backend workspace and uses the production container image with a copied production SQLite DB.

## What this does
- Clones the prod SQLite DB into gitignored volumes (`./volumes/sqlite`).
- Starts the production API container with the same credential mount you use in prod (`/home/node/.codex`).
- Runs a real `/api/generator/generate` request against the container.
- Verifies artifacts land on disk, database rows are written, and captures container logs for inspection.
- Optional hot-reload profile mounts the local source tree and runs `npm run dev` inside the container for rapid prompt/PDF iteration.

## Pre-reqs
- Docker + docker compose v2
- Access to the prod host (or a recent DB backup) to copy `/srv/job-finder/data/jobfinder.db`
- Codex CLI credentials in the same path you mount in production (typically `~/.codex`)
- `jq`, `sqlite3`, and `curl` on your host

## Quick start
1) Move into the harness directory
```bash
cd job-finder-BE/server/validation
```

2) Create your env file (kept gitignored)
```bash
cp .env.validation.example .env.validation
# Edit CODEX_DIR to match your production mount (do NOT copy credentials into the repo)
```

3) Clone the production DB (requires SSH access)
```bash
PROD_SSH_HOST=prod-jobfinder ./clone-prod-db.sh
```

4) Ensure personal-info is configured
```bash
./setup-personal-info.sh
# Edit the script to match your actual personal info if needed
```

5) Run the end-to-end validation
```bash
./run-validation.sh
```
- Response JSON: `output/last-response.json`
- Container logs: `output/container.log`
- Artifacts: `volumes/artifacts/` (open the PDFs to judge formatting)
- DB check: `output/db-check.txt`

5) Iterate on prompts/PDF formatting
- Update TS/handlebars in the repo
- Re-run `./run-validation.sh` to see new PDFs and DB rows
- For live reload inside a container: `PROFILE=hotreload ./run-validation.sh` (starts `api-dev` with source + shared mounted)

## Changing the sample request
Edit `sample-request.json` or pass a custom payload file:
```bash
PAYLOAD_FILE=/path/to/custom.json ./run-validation.sh
```
- A ready-made example from Veeva (Senior Software Engineer, Full Stack) lives at `payloads/veeva-sse-portland.json`.

## Troubleshooting notes
- **TLS/Connection errors**: If Codex CLI fails with `ERROR: Connection failed ... chatgpt.com/backend-api/codex/responses`, ensure the container image includes `ca-certificates`. The slim Debian base image lacks CA certs, which breaks native TLS in the Codex binary (Node.js bundles its own certs so it works, but Codex CLI doesn't). Fixed in commit `105f841`.
- **Auth issues**: Ensure `~/.codex` from the host is mounted correctly. The runner `docker cp`'s it into `/home/node/.codex`. If login status shows authenticated but requests fail, refresh the host Codex login (`codex logout && codex login`) and rerun.

## Cleanup
```bash
docker compose -f docker-compose.validation.yml --profile prod down
# or --profile hotreload down
```
Volumes live under `./volumes/` (gitignored) and can be deleted manually if you want a fresh run.
