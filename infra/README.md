# Infrastructure Overview

The `infra/` directory tracks deployment artifacts that used to live across multiple repos. Each subfolder now has a single owner inside the monorepo:

| Path | Purpose |
| --- | --- |
| [`infra/cloudflared`](./cloudflared) | Cloudflared tunnel configuration + sample manifests for exposing the API host. |
| [`infra/docker-compose.yml`](./docker-compose.yml) | Local compose stack that mirrors the production single-host deployment (API, worker, SQLite, Cloudflared). |
| [`infra/sqlite`](./sqlite) | SQLite schema plus the TypeScript seed/export workspace. |

## SQLite Workspace

- [`schema.sql`](./sqlite/schema.sql) is the authoritative schema used by the API and seeded via migrations.
- [`seeders`](./sqlite/seeders) is an npm workspace (already declared in the root `package.json`). Use it to export Firestore data or bootstrap new SQLite instances:

```bash
npm install --workspace infra/sqlite/seeders
npm run export:firestore --workspace infra/sqlite/seeders
```

Add new infrastructure modules (Terraform, Ansible, etc.) under this folder so they stay versioned with the rest of the stack.
