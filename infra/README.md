# Infrastructure

Production configuration for the job-finder stack. All services run as Docker containers managed by `docker compose` at `/srv/job-finder/`.

## Directory Structure

| Path | Purpose |
| --- | --- |
| [`docker-compose.prod.yml`](./docker-compose.prod.yml) | Production Docker Compose stack (synced to `/srv/job-finder/docker-compose.yml`) |
| [`litellm-config.yaml`](./litellm-config.yaml) | LiteLLM proxy model routing (synced to `/srv/job-finder/infra/`) |
| [`litellm-config.dev.yaml`](./litellm-config.dev.yaml) | LiteLLM config for local development |
| [`cloudflared/config.template.yml`](./cloudflared/config.template.yml) | Template for Cloudflare tunnel config |
| [`sqlite/`](./sqlite) | SQLite schema, migrations, and seed/export workspace |

## AI Inference Architecture

All AI calls route through the **LiteLLM proxy** (`litellm:4000`), which provides a unified OpenAI-compatible API.

| Model Name | Provider | Use Case |
| --- | --- | --- |
| `claude-document` | Anthropic Claude Sonnet | Document generation, chat |
| `gemini-general` | Google Gemini Flash | General-purpose, fallback |
| `local-extract` | Ollama (llama3.1:8b) | Extraction/analysis, zero cost |

Fallback chains: `claude-document → gemini-general`, `local-extract → gemini-general → claude-document`.

## Production Layout

```
/srv/job-finder/
├── .env                   # LITELLM_MASTER_KEY, GOOGLE_CLOUD_PROJECT
├── docker-compose.yml     # Synced from infra/docker-compose.prod.yml
├── infra/
│   └── litellm-config.yaml  # Synced from infra/litellm-config.yaml
├── data/                  # SQLite database
├── artifacts/             # Generated documents
├── logs/                  # Application logs
├── secrets/
│   ├── api.env            # CORS, generator config
│   ├── worker.env         # ANTHROPIC_API_KEY, GEMINI_API_KEY
│   └── firebase-admin.json
└── cloudflared/           # Tunnel config + credentials
```

## Deploying

```bash
# Sync config files only
./scripts/deploy.sh

# Sync and recreate containers (also pulls Ollama model if missing)
./scripts/deploy.sh --recreate
```

Watchtower handles **image** updates automatically (pulls new images from GHCR every 5 minutes). Compose file and LiteLLM config changes require running `deploy.sh`.

LiteLLM is excluded from Watchtower — update it deliberately:
```bash
cd /srv/job-finder && docker compose pull litellm && docker compose up -d litellm
```

## Fresh Setup

1. Create required directories:
   ```bash
   mkdir -p /srv/job-finder/{data,secrets,logs,artifacts,cloudflared,infra}
   ```

2. Create `/srv/job-finder/.env`:
   ```bash
   LITELLM_MASTER_KEY=<generate-a-random-key>
   GOOGLE_CLOUD_PROJECT=<your-gcp-project>
   ```

3. Create secret files in `/srv/job-finder/secrets/`:

   **`api.env`** — API-specific config:
   ```bash
   CORS_ALLOWED_ORIGINS="https://your-domain.com"
   GENERATOR_BYPASS_TOKEN="your-secure-token"
   GENERATOR_ARTIFACTS_PUBLIC_BASE="https://your-domain.com/api/generator/artifacts"
   ```

   **`worker.env`** — AI provider keys (used by LiteLLM proxy):
   ```bash
   ANTHROPIC_API_KEY="sk-ant-..."
   GEMINI_API_KEY="..."
   WORKER_WS_TOKEN="shared-secret"
   ```

   **`firebase-admin.json`** — Firebase Admin SDK credentials

4. Deploy:
   ```bash
   ./scripts/deploy.sh --recreate
   ```

## SQLite

[`schema.sql`](./sqlite/schema.sql) is the authoritative schema. Migrations live in [`sqlite/migrations/`](./sqlite/migrations/).
