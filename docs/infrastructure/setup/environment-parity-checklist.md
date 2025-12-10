# Environment Parity Checklist

> Status: Active
> Owner: @jdubz
> Last Updated: 2025-12-09

Use this checklist to verify configuration alignment across environments (development, staging, production) before deployment or cutover.

## API Service

| Item                  | Development              | Staging                  | Production               | Notes                              |
|-----------------------|-------------------------|--------------------------|--------------------------|-----------------------------------|
| Node.js Version       | `18+`                   | `18+`                    | `18+`                    | Verify in Dockerfile              |
| Port                  | `8080`                  | `8080`                   | `8080`                   | Internal container port           |
| Database Path         | `./data/sqlite/`        | `/data/sqlite/`          | `/data/sqlite/`          | Docker volume mount               |
| Log Level             | `debug`                 | `info`                   | `info`                   | Via `LOG_LEVEL` env var           |
| CORS Origins          | `localhost:5173`        | Staging domain           | Production domain        | Verify in API config              |

## Frontend

| Item                  | Development              | Staging                  | Production               | Notes                              |
|-----------------------|-------------------------|--------------------------|--------------------------|-----------------------------------|
| API Base URL          | `localhost:8080`        | Staging API URL          | Production API URL       | `VITE_API_BASE_URL`               |
| Google Client ID      | Dev client ID           | Staging client ID        | Production client ID     | OAuth configuration               |
| Build Mode            | Development             | Production               | Production               | Vite build mode                   |

## Worker Service

| Item                  | Development              | Staging                  | Production               | Notes                              |
|-----------------------|-------------------------|--------------------------|--------------------------|-----------------------------------|
| Python Version        | `3.9+`                  | `3.9+`                   | `3.9+`                   | Verify in Dockerfile              |
| Database Path         | `./data/sqlite/`        | `/data/sqlite/`          | `/data/sqlite/`          | Docker volume mount               |
| Log Level             | `DEBUG`                 | `INFO`                   | `INFO`                   | Via `LOG_LEVEL` env var           |
| Selenium Mode         | Headless                | Headless                 | Headless                 | Browser automation config         |

## Database

| Item                  | Development              | Staging                  | Production               | Notes                              |
|-----------------------|-------------------------|--------------------------|--------------------------|-----------------------------------|
| Database Type         | SQLite                  | SQLite                   | SQLite                   | File-based database               |
| File Location         | `./data/sqlite/`        | `/data/sqlite/`          | `/data/sqlite/`          | Docker volume mount               |
| WAL Mode              | Enabled                 | Enabled                  | Enabled                  | Write-ahead logging               |
| Migrations            | Manual/Makefile         | Auto on deploy           | Auto on deploy           | sqlite-migrator service           |

## Infrastructure

| Item                  | Development              | Staging                  | Production               | Notes                              |
|-----------------------|-------------------------|--------------------------|--------------------------|-----------------------------------|
| Docker Compose        | Local                   | Remote server            | Remote server            | Deployment method                 |
| External Access       | localhost               | Cloudflare Tunnel        | Cloudflare Tunnel        | Network exposure                  |
| Domain                | N/A                     | staging subdomain        | production domain        | DNS configuration                 |
| SSL/TLS               | N/A                     | Cloudflare managed       | Cloudflare managed       | HTTPS termination                 |
| Container Updates     | Manual                  | Watchtower               | Watchtower               | Auto-update mechanism             |

## Environment Variables

| Variable               | Development              | Staging                  | Production               | Notes                              |
|-----------------------|-------------------------|--------------------------|--------------------------|-----------------------------------|
| `NODE_ENV`            | `development`           | `production`             | `production`             | Node environment                  |
| `PORT`                | `8080`                  | `8080`                   | `8080`                   | API port                          |
| `SQLITE_PATH`         | Local path              | Docker volume            | Docker volume            | Database location                 |
| `GOOGLE_CLIENT_ID`    | Dev credentials         | Staging credentials      | Prod credentials         | OAuth client                      |
| `ANTHROPIC_API_KEY`   | Personal key            | Shared key               | Shared key               | AI API key                        |
| `OPENAI_API_KEY`      | Personal key            | Shared key               | Shared key               | AI API key                        |
| `LOG_LEVEL`           | `debug`                 | `info`                   | `info`                   | Logging verbosity                 |

## Secrets Management

| Item                  | Development              | Staging                  | Production               | Notes                              |
|-----------------------|-------------------------|--------------------------|--------------------------|-----------------------------------|
| Storage Method        | `.env` files            | GitHub Secrets           | GitHub Secrets           | Secret storage                    |
| Rotation Policy       | N/A                     | Quarterly                | Quarterly                | Key rotation schedule             |
| Access Control        | Developer               | CI/CD only               | CI/CD only               | Who can access secrets            |

## Monitoring & Logging

| Item                  | Development              | Staging                  | Production               | Notes                              |
|-----------------------|-------------------------|--------------------------|--------------------------|-----------------------------------|
| Sentry DSN            | N/A or test             | Staging project          | Production project       | Error tracking                    |
| Log Output            | Console                 | Docker logs              | Docker logs + forwarding | Log destination                   |
| Health Checks         | Manual                  | Automated                | Automated                | Uptime monitoring                 |

## How to Use This Checklist

1. **Before deployment**: Review each row to ensure values are correct
2. **After configuration changes**: Update this document and verify all environments
3. **During incidents**: Use as reference for expected configuration
4. **New team members**: Reference for understanding environment differences

## Parity Verification Commands

### Check API Configuration

```bash
# Development
curl http://localhost:8080/api/healthz

# Staging
curl https://job-finder-staging.joshwentworth.com/api/healthz

# Production
curl https://job-finder.joshwentworth.com/api/healthz
```

### Check Container Status

```bash
# On deployment server
docker compose ps
docker compose logs --tail=50
```

### Verify Database

```bash
# Check database file exists
ls -la /data/sqlite/

# Check migrations applied
sqlite3 /data/sqlite/jobfinder.db ".tables"
```

## Best Practices

- Verify parity before any production deployment
- Document any intentional differences between environments
- Automate parity checks where possible
- Keep this checklist updated as infrastructure evolves
- Review and update after each deployment
