# FE-API-1 — Align API Clients With Backend Contracts

**Status:** To Do  
**Priority:** P0 (Critical)  
**Owner:** TBD  
**Related Repos:** job-finder-FE, job-finder-BE  
**Source:** Consolidated from `job-finder-docs/API_CONTRACT_MISMATCHES.md`

## Problem
Frontend API clients for Content Items, Generator, and Job Queue diverge from the backend contract. Requests hit incorrect paths, send mismatched payloads, or assume endpoints that do not exist. Production parity requires the clients to call the same routes the Cloud Functions expose.

## Impact
- Content management flows fail (create/update/delete, hierarchy cascade, reorder).
- Generator workflows do not trigger because generated payloads differ (`type` vs `generateType`).
- Job Queue operations (submit, retry, stats) return 404/405 responses due to wrong endpoints.

## Required Changes

### 1. Content Items Client (`src/api/content-items-client.ts`)
- Prefix all requests with `/manageContentItems/content-items` as defined by the backend.
- Remove `action` fields from POST/PUT payloads; the backend derives intent from the HTTP verb.
- Use `/content-items/:id/cascade` when deleting with children.
- Call `POST /content-items/reorder` (not PATCH) to reorder items.

### 2. Generator Client (`src/api/generator-client.ts`)
- Post to `/manageGenerator/generator/generate` for document generation.
- Align payload shape with backend expectations (`generateType`, `provider`, nested `job` object).
- Normalize response parsing for generator requests.

### 3. Job Queue Client (`src/api/job-queue-client.ts`)
- Align submit endpoints with hyphenated backend routes (`/submit`, `/submit-scrape`, `/submit-company`).
- Use `/manageJobQueue/status/:id`, `/manageJobQueue/stats`, `/manageJobQueue/retry/:id` endpoints.
- Remove or replace calls to `/queue` list endpoint (not implemented server-side).

## Tasks
- [ ] Update Content Items client paths/payloads; add integration coverage for CRUD and reorder.
- [ ] Update Generator client endpoint and payload; coordinate with shared-types if schema changes.
- [ ] Update Job Queue client endpoints; decide on `/queue` list strategy.
- [ ] Run frontend unit/integration tests (`npm test`).
- [ ] Smoke test critical flows locally against current backend (content, generator, queue submissions).
- [ ] Confirm backend configuration does not require additional changes.

## Verification
1. Frontend tests pass locally and in CI.
2. Manual QA confirms content hierarchy edits, generator workflow, and queue submissions operate without HTTP errors.
3. App Monitor logs show successful API calls without mismatched path warnings.

## Follow-Up
If backend endpoints need adjustments (e.g., `/queue` list support), open partner issues in `job-finder-BE`. Coordinate schema updates via `job-finder-shared-types` if new request fields are required.
