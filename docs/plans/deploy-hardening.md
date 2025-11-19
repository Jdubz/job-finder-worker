> Status: Active
> Owner: @platform
> Last Updated: 2025-11-19

# Cloudflared & Compose Hardening Plan

_Last updated: November 19, 2025_

This document captures MIG-005 and describes how to finish hardening the single-host deployment that runs the Node API, worker, SQLite, Cloudflared tunnel, and Watchtower. The goal is to make the stack reproducible, secrets-aware, and observable enough to support the production cutover.

## 1. Objectives
- Validate that `infra/docker-compose.yml` plus host directory scaffolding cover every runtime dependency.
- Ensure Cloudflared tunnel credentials and `.env` secrets never leak into the repo while remaining easy to load on the host.
- Lock down Watchtower so only explicitly labelled services are auto-updated, with clear alerting via logs.
- Provide an operator checklist for verifying the deployment after each Compose change.

## 2. Host Preparation Checklist
1. Create required directories on the host and set ownership to the deployment user:
   ```bash
   sudo install -d -m 750 /srv/job-finder/{data,backups,secrets,config,logs,worker-data,cloudflared}
   sudo chown $USER:$USER /srv/job-finder/*
   ```
2. Copy `infra/cloudflared/config.yml` to `/srv/job-finder/cloudflared/config.yml` and place the tunnel credentials JSON referenced by `${CLOUDFLARE_TUNNEL_ID}` in the same directory.
3. Store `firebase-admin.json`, worker configs, and `.env` outside the repo (`../.env`) and feed them in with `op run --env-file ../.env -- docker compose -f infra/docker-compose.yml up -d`.

## 3. Compose & Secret Requirements
- Keep the bind mounts defined in `infra/docker-compose.yml` one-to-one with host paths. Never edit the Compose file on-host; change it in Git and redeploy.
- Validate that each service carries the `com.centurylinklabs.watchtower.enable=true` label. Only those services should be restarted by Watchtower.
- Confirm `.env` contains the following variables before each deploy: `ADMIN_EMAILS`, `GOOGLE_OAUTH_CLIENT_ID`, `CLOUDFLARE_TUNNEL_ID`, `MAILGUN_API_KEY`, `OPENAI_API_KEY`, `FIREBASE_PROJECT_ID`, `JOBFINDER_DB_BACKUP_DIR`. Anything stored in 1Password stays referenced via `op run` or host bind mounts.

## 4. Cloudflared Expectations
1. `infra/cloudflared/config.yml` must stay committed with comments explaining placeholders; the runtime copy under `/srv/job-finder/cloudflared` should include real hostnames.
2. Operators run:
   ```bash
   docker compose -f infra/docker-compose.yml --env-file ../.env up -d cloudflared
   docker logs -f job-finder-cloudflared
   ```
   Ensure "Connection established" logs appear before routing traffic through the tunnel.
3. Rotate tunnel credentials quarterly by reissuing the token via Cloudflare Access and replacing the JSON file; restart the container afterwards.

## 5. Validation Procedure
After any Compose or image change:
1. `docker compose ... ps` shows `api`, `worker`, `sqlite-migrator` (exited 0), `cloudflared`, and `watchtower` as healthy.
2. `sqlite3 /srv/job-finder/data/jobfinder.db "pragma integrity_check;"` returns `ok`.
3. `curl -H "Authorization: Bearer <GIS token>" https://job-finder-api.joshwentworth.com/health` succeeds through the Cloudflared tunnel.
4. Watchtower logs display only label-enabled services and note successful polling every 5 minutes.
5. Cloudflared logs show zero `502` or authentication errors over a 10-minute window.

## 6. Deliverables
- ✅ Compose file checked in (`infra/docker-compose.yml`).
- ✅ Host bootstrap commands (section 2) documented here.
- ✅ Cloudflared config committed with placeholders plus runtime instructions.
- 🔜 Once the above is confirmed on the host, mark MIG-005 as Done and link to this plan + the deploy log pasted in the team channel.
