> Status: Active
> Owner: @jdubz
> Last Updated: 2025-11-18

# Action Item Backlog

| ID | Description | Owner | Target Date | Status |
| --- | --- | --- | --- | --- |
| DOC-001 | Embed metadata + owners across legacy docs under `docs/backend`, `docs/frontend`, `docs/worker`, `docs/shared`. | @docs-team | 2025-12-05 | Done |
| DOC-002 | Audit `docs/archive/` and move/retire obsolete content per guidelines. | @docs-team | 2025-12-12 | Not Started |
| DOC-003 | Automate metadata linting (`npm run docs:audit`) in CI. | @platform | 2025-12-08 | Done |
| MIG-001 | Finish Express routing parity for all former Firebase Functions endpoints (content items, job queue, generator, health). | @backend | 2025-12-10 | Done |
| MIG-002 | Implement SQLite data access modules + migration runner (`infra/sqlite/schema.sql` → runtime migrations). | @backend | 2025-12-12 | Done |
| MIG-003 | Update worker adapters to read/write via SQLite (`job-finder-worker` queue + content ingestion). | @worker | 2025-12-15 | Done |
| MIG-004 | Swap frontend to consume the Node API (remove direct Firestore usage, add polling/WebSocket plan). | @frontend | 2025-12-18 | Done |
| MIG-005 | Harden Cloudflared + Docker Compose deployment (Watchtower config, `.env` secrets, shared volumes). | @platform | 2025-12-05 | Ready for host validation (`docs/plans/deploy-hardening.md`) |
| MIG-007 | Execute cutover checklist: point FE/worker to Cloudflared URL, monitor metrics, keep Firebase read-only fallback. | @migration-team | 2025-12-20 | Planning complete (`docs/plans/cutover-checklist.md`) |
| MIG-008 | Remove residual Firebase deployments/emulator scripts once cutover is stable. | @backend | 2026-01-05 | In Progress – backend artifacts removed; frontend GIS swap tracked in `MIG-008A` |
| MIG-008A | Frontend GIS migration (replace Firebase Auth/App Check, drop SDK + emulator docs). | @frontend | 2025-12-20 | In Progress – AuthContext/Base client now GIS (`docs/plans/frontend-gis-migration.md`) |

> Add new entries instead of sprinkling TODOs in docs. When a task is completed, update the status (`In Progress`, `Blocked`, `Done`) and link to the PR or doc that resolved it.
