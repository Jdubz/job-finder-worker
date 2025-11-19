> Status: Active
> Owner: @jdubz
> Last Updated: 2025-11-18

# Plans & RFCs

The `docs/plans` directory contains roadmap material, migration prep notes, and ad‑hoc RFCs that apply to the whole platform (not just a single workspace).

## Key Documents

- [`prod-migration-prep.md`](./prod-migration-prep.md) – canonical plan for the single-host SQLite + Cloudflared deployment.
- [`node-server-migration.md`](./node-server-migration.md) – Express/Fastify replacement for Firebase Functions, Docker/Watchtower flow, and cutover steps.
- [`sqlite-migration.md`](./sqlite-migration.md) – Firestore → SQLite persistence plan (schema mapping, adapters, backups).
- [`deploy-hardening.md`](./deploy-hardening.md) – Host prep, Cloudflared, and Compose requirements for the production stack (MIG-005).
- [`cutover-checklist.md`](./cutover-checklist.md) – Day-of production cutover plan (MIG-007).
- [`firebase-cleanup.md`](./firebase-cleanup.md) – Post-cutover removal of Firebase resources/scripts (MIG-008).

## Adding New Plans

1. Create a Markdown file with a descriptive name (e.g., `sqlite-backup-plan.md`).
2. Include `Last updated` metadata near the top.
3. Link the file here so others can discover it easily.

Prefer keeping system-wide plans in this directory; component-specific RFCs should sit next to their code (e.g., worker RFCs under `docs/worker/worker-docs`).
