> Status: Draft  
> Owner: @jdubz  
> Last Updated: 2025-11-19

# Generator Workflow (Express + Codex)

## Overview

The legacy `manageGenerator` Cloud Function has been ported into the Express server (`job-finder-BE/server`). All `/api/generator/*` routes now hit the Node process directly, which orchestrates AI runs via the Codex CLI and stores state in SQLite.

```
/api/generator
├── GET/PUT /personal-info      (Config-backed store)
├── POST /generate              (Synchronous resume/cover letter run)
├── POST /start                 (Create request + pending steps)
├── POST /step/:id              (Advance the next pending step)
├── GET  /requests              (History with steps + artifacts)
└── GET  /artifacts/:requestId/:type/:filename  (Streams stored PDFs/images)
```

Requests + artifacts live in `generator_requests`, `generator_steps`, and `generator_artifacts` tables (`infra/sqlite/migrations/004_generator_workflow.sql`).

## CLI Execution

Codex is the default agent; Gemini/Claude are available as fallbacks but are disabled unless explicitly configured.

| Provider | CLI command (non-interactive) | Notes |
| --- | --- | --- |
| Codex (default) | `codex exec --cd /workspace --dangerously-bypass-approvals-and-sandbox '<prompt>'` | Produces the most stable JSON output for resume/cover-letter prompts. |
| Gemini (opt-in) | `gemini --print --model gemini-1.5-flash --output json --prompt '<prompt>'` | Quality issues observed with Gemini 2.5 Flash/Pro – use only for experimentation. |
| Claude (opt-in) | `claude --print --dangerously-skip-permissions --output-format json --prompt '<prompt>'` | Reserved for code-generation-style requests. |

### Credentials

Mirror the dev-bot pattern:

1. Mount local creds read-only when starting the container (e.g., `-v ~/.codex/credentials.json:/tmp/host-creds/codex.json:ro`).
2. During container startup, copy each file into the tool’s runtime directory (e.g., `/home/node/.codex/.credentials.json`) and set perms to `0700`.
3. Never bake secrets into the image.

## Multi-step Flow

1. `POST /api/generator/start` payload mirrors the old `/generate` request. Response includes `{ requestId, status, steps[] }`.
2. `POST /api/generator/step/:id` advances whichever step is still `pending` (`collect-data` → `generate-resume` → `generate-cover-letter` → `render-pdf`). Each call updates SQLite, saves artifacts, and returns the latest step list.
3. Artifacts are stored on disk under the `GENERATOR_ARTIFACTS_DIR` bind mount (see `workflow/services/storage.service.ts`). Download them via `/api/generator/artifacts/:requestId/:type/:filename`.

`POST /api/generator/generate` still exists for synchronous calls—it simply delegates to `start` + repeated `step` calls under the hood.

## Frontend / Worker Adoption Checklist

- Update the frontend generator UI to call `/start` then `/step/:id` until all steps are complete (or continue using `/generate` for single-shot runs).
- Replace any remaining Firestore listeners with `GET /api/generator/requests`.
- Worker jobs that reference `generator_documents` should migrate to the new tables or JSON files in `/data/config`.
- Once all clients use the Express routes, we can remove the Firebase `manageGenerator` deployment and delete the proxy.
