# Production Deployment Checklist

> Status: Active
> Owner: @jdubz
> Last Updated: 2025-12-09

## Overview

Production deployment uses Docker Compose with services exposed via Cloudflare Tunnel. This checklist covers the deployment procedures for all services.

## Architecture

```
Internet → Cloudflare Tunnel → Docker Compose Stack
                                ├── API (Express)
                                ├── Worker (Python)
                                └── SQLite Database
```

### Domain Configuration

- **Production**: `job-finder.joshwentworth.com` → Cloudflare Tunnel → API container
- **Staging**: `job-finder-staging.joshwentworth.com` → Cloudflare Tunnel → API container

## Pre-Deployment Checklist

### 1. Code Verification

- [ ] All tests passing (`make test`)
- [ ] Linting passes (`make lint`)
- [ ] TypeScript compiles without errors
- [ ] No security vulnerabilities in dependencies

### 2. Environment Configuration

- [ ] Production `.env` file configured
- [ ] API keys and secrets set
- [ ] Database path configured
- [ ] Cloudflare tunnel token set

### 3. Database

- [ ] Migrations are up to date
- [ ] Database backup taken (if updating schema)
- [ ] Migration script tested locally

## Deployment Procedures

### 1. Build and Push Docker Images

```bash
# Build images
docker compose -f infra/docker-compose.yml build

# Or for specific services
docker compose -f infra/docker-compose.yml build api
docker compose -f infra/docker-compose.yml build worker
```

### 2. Run Database Migrations

```bash
# Migrations run automatically via sqlite-migrator service
# Or manually:
docker compose -f infra/docker-compose.yml run --rm sqlite-migrator
```

### 3. Deploy Services

```bash
# Deploy all services
docker compose -f infra/docker-compose.yml up -d

# Check service status
docker compose -f infra/docker-compose.yml ps

# View logs
docker compose -f infra/docker-compose.yml logs -f
```

### 4. Verify Deployment

```bash
# Health check
curl https://job-finder.joshwentworth.com/api/healthz

# Readiness check
curl https://job-finder.joshwentworth.com/api/readyz
```

## Docker Compose Services

| Service          | Purpose                          |
|-----------------|----------------------------------|
| `api`           | Express backend API              |
| `worker`        | Python job processing worker     |
| `sqlite-migrator`| Database migrations (run once)  |
| `cloudflared`   | Cloudflare tunnel for external access |
| `watchtower`    | Automatic container updates      |

## Rollback Procedures

### Quick Rollback

```bash
# Stop current deployment
docker compose -f infra/docker-compose.yml down

# Pull previous image version
docker pull your-registry/job-finder-api:previous-tag

# Redeploy with previous version
docker compose -f infra/docker-compose.yml up -d
```

### Database Rollback

If a migration caused issues:

1. Stop services
2. Restore database from backup
3. Revert code to previous version
4. Redeploy

## Monitoring Post-Deployment

### Immediate Checks (0-15 minutes)

- [ ] Health endpoints responding
- [ ] No errors in application logs
- [ ] Cloudflare tunnel connected
- [ ] API requests completing successfully

### Short-term Monitoring (15-60 minutes)

- [ ] Error rates normal
- [ ] Response times acceptable
- [ ] Worker processing queue items
- [ ] No memory leaks or resource issues

## Environment Variables

### Required for Production

```env
NODE_ENV=production
PORT=8080
SQLITE_PATH=/data/sqlite/jobfinder.db
GOOGLE_CLIENT_ID=your-client-id
ANTHROPIC_API_KEY=your-api-key
OPENAI_API_KEY=your-api-key
CLOUDFLARE_TUNNEL_TOKEN=your-tunnel-token
```

## CI/CD Pipeline

### GitHub Actions Workflow

Automated deployment triggers on:
- Push to `main` branch (production)
- Push to `staging` branch (staging)

Workflow steps:
1. Run tests
2. Build Docker images
3. Push to container registry
4. Deploy via SSH/Docker Compose

## Security Checklist

- [ ] No secrets in code or logs
- [ ] HTTPS enforced via Cloudflare
- [ ] CORS configured correctly
- [ ] Rate limiting enabled
- [ ] Authentication working

## Troubleshooting

### API Not Responding

1. Check container status: `docker compose ps`
2. View logs: `docker compose logs api`
3. Check Cloudflare tunnel: `docker compose logs cloudflared`
4. Verify database connectivity

### Worker Not Processing

1. Check worker logs: `docker compose logs worker`
2. Verify database access
3. Check queue for stuck items
4. Restart worker: `docker compose restart worker`

### Database Issues

1. Check database file permissions
2. Verify volume mount
3. Check disk space
4. Review migration logs

## Post-Deployment Documentation

After deployment, update:
- [ ] Version changelog
- [ ] Deployment log with date/time
- [ ] Any configuration changes made
