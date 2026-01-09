# API Development Environment

Development harness for the backend API server. Matches production as closely as possible while enabling rapid local iteration.

## Quick Start (Preferred)

```bash
cd job-finder-BE/server
make dev-setup
make dev-clone-db-scp SCP_SRC=user@host:/srv/job-finder/data/jobfinder.db

make dev-up
make dev-validate
```

## What this does
- Clones the prod SQLite DB into `.dev/data/` (gitignored).
- Starts the production API container with AI credentials from env vars.
- Runs real `/api/generator/start` + `/api/generator/step/:id` requests against the container.
- Verifies artifacts land on disk and captures container logs.
- Optional hot-reload profile mounts local source for rapid iteration.

## AI Credentials

Set the following in your `.env.dev` file:

```bash
# Claude CLI (for claude.cli agent)
CLAUDE_CODE_OAUTH_TOKEN=your-oauth-token

# Gemini API (for gemini.api agent)
GOOGLE_API_KEY=your-api-key
# or GEMINI_API_KEY=your-api-key
```

## Directory Structure

```
job-finder-BE/server/
├── docker-compose.dev.yml    # Main dev compose file
├── Makefile                  # Dev commands (make dev-*)
├── .env.dev                  # Dev environment (gitignored)
├── .env.dev.example          # Template for .env.dev
├── .dev/                     # Runtime data (gitignored)
│   ├── data/                 # SQLite database
│   ├── artifacts/            # Generated PDFs
│   ├── logs/                 # Container logs
│   └── output/               # Test output
└── dev/                      # This directory
    ├── run-dev.sh            # Test harness script
    ├── clone-prod-db.sh      # DB cloning script
    ├── sample-request.json   # Test payload
    ├── payloads/             # Additional test payloads
    └── README.md             # This file
```

## Available Commands

```bash
make dev-setup          # Create .dev/ directories and .env.dev
make dev-clone-db       # Clone DB from local path
make dev-clone-db-scp   # Clone DB via SCP
make dev-up             # Start containers (prod image)
make dev-up-hotreload   # Start with hot reload
make dev-down           # Stop containers
make dev-logs           # Tail container logs
make dev-shell          # Shell into container
make dev-validate       # Run generator test
make dev-clean          # Clean logs/output (artifacts kept)
make dev-clean-all      # Remove entire .dev/
```

## Scripts in this Directory

### run-dev.sh
Runs a full generator test cycle:
```bash
./dev/run-dev.sh
# Or with custom payload:
PAYLOAD_FILE=./dev/payloads/custom.json ./dev/run-dev.sh
# Or with hot reload:
PROFILE=hotreload ./dev/run-dev.sh
```

### clone-prod-db.sh
Clones the production database via SCP:
```bash
PROD_SSH_HOST=prod-server ./dev/clone-prod-db.sh
```

## Troubleshooting

- **TLS/Connection errors**: Ensure container image includes `ca-certificates`.
- **Auth issues**: Check your API keys in `.env.dev`.
- **Permission issues**: Ensure your user has UID 1000 to match container's node user.

## Cleanup

```bash
make dev-down       # Stop containers
make dev-clean-all  # Remove all dev data
```
