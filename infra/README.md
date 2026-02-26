# Infrastructure Overview

The `infra/` directory contains **templates and development configurations** for the job-finder stack. Production configurations with sensitive details are stored on the production server and **NOT** tracked in this public repository.

## Directory Structure

| Path | Purpose |
| --- | --- |
| [`infra/cloudflared/config.template.yml`](./cloudflared/config.template.yml) | **Template** for Cloudflared tunnel configuration. Production config lives in `/srv/job-finder/cloudflared/config.yml` |
| [`infra/docker-compose.template.yml`](./docker-compose.template.yml) | **Template** for production Docker Compose stack. Production config lives in `/srv/job-finder/docker-compose.yml` |
| [`infra/sqlite`](./sqlite) | SQLite schema, migrations, and seed/export workspace |
| [`docs/backend/architecture/scheduler.md`](../docs/backend/architecture/scheduler.md) | Details on the API-owned scheduler (cron replacement) |

## Production Configuration Locations

**These files are NOT in the repository** for security reasons. They live on the production server:

| File | Location | Contains |
| --- | --- | --- |
| Docker Compose | `/srv/job-finder/docker-compose.yml` | Production paths and volume mounts |
| Cloudflared Config | `/srv/job-finder/cloudflared/config.yml` | Actual tunnel ID and production hostname |
| Cloudflared Credentials | `/srv/job-finder/cloudflared/*.json` | Tunnel authentication credentials |
| Production Config | `/srv/job-finder/config/config.production.yaml` | Worker configuration with production settings |
| Database | `/srv/job-finder/data/jobfinder.db` | SQLite database file |
| Secrets | `/srv/job-finder/secrets/` | Firebase admin credentials and other secrets |
| Logs | `/srv/job-finder/logs/` | Application logs |
| Backups | `/srv/job-finder/backups/` | Database backups |
| Artifacts | `/srv/job-finder/artifacts/` | Generated PDFs, images, etc. |

## Setting Up Production

1. Copy template files to production server:
   ```bash
   cp infra/docker-compose.template.yml /srv/job-finder/docker-compose.yml
   cp infra/cloudflared/config.template.yml /srv/job-finder/cloudflared/config.yml
   ```

2. Update the copied files with production values:
   - Replace volume paths
   - Set actual tunnel IDs and hostnames
   - Configure environment variables

3. Create service-specific environment files in `/srv/job-finder/secrets/`:

   **API environment** (`/srv/job-finder/secrets/api.env`):
   ```bash
   # CORS configuration - comma-separated list of allowed frontend origins
   CORS_ALLOWED_ORIGINS="https://job-finder.joshwentworth.com"

   # Firebase configuration (for auth verification)
   FIREBASE_PROJECT_ID="your-project-id"
   FIREBASE_CLIENT_EMAIL="your-service-account@project.iam.gserviceaccount.com"
   FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----
   ...
   -----END PRIVATE KEY-----"

   # Generator settings
   GENERATOR_BYPASS_TOKEN="your-secure-token"
   GENERATOR_ARTIFACTS_PUBLIC_BASE="https://your-domain.com/api/generator/artifacts"
   ```

   **Worker environment** (`/srv/job-finder/secrets/worker.env`):
   ```bash
   # AI provider API keys (used by LiteLLM proxy)
   ANTHROPIC_API_KEY="sk-ant-..."
   GEMINI_API_KEY="..."

   # Worker/WebSocket auth (shared secret between API and worker)
   WORKER_WS_TOKEN="change-me"
   ```

   > **Note:** Service-specific env files follow least-privilege principle - each service only gets the secrets it needs. Common settings like `DATABASE_PATH` are defined directly in the compose file's `environment:` block.

4. Ensure all required directories exist:
   ```bash
   mkdir -p /srv/job-finder/{data,secrets,config,logs,worker-data,cloudflared,artifacts,backups}
   ```

5. Deploy using CI/CD (see `.github/workflows/deploy.yml`)

## SQLite Workspace

- [`schema.sql`](./sqlite/schema.sql) is the authoritative schema used by the API and seeded via migrations.
- Legacy cloud export snapshots now live under `data/backups/cloud-exports/` for reference only.


Add new infrastructure modules (Terraform, Ansible, etc.) under this folder so they stay versioned with the rest of the stack.
