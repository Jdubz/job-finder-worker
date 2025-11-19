> Status: Active
> Owner: @jdubz
> Last Updated: 2025-11-18

# Job Matches & AI Prompts REST API

Job-finder-BE now exposes REST endpoints for queue consumers (job matches) and AI prompt administration. These replace the remaining Firestore reads in the frontend.

## Endpoints

### GET `/api/job-matches`
- Query params: `minScore`, `maxScore`, `companyName`, `priority`, `limit`, `offset`, `sortBy (score|date|company)`, `sortOrder (asc|desc)`
- Response: `ListJobMatchesResponse`
- Auth: Firebase Auth bearer + App Check header

### GET `/api/job-matches/:id`
- Returns `GetJobMatchResponse`
- 404 when not found

### GET `/api/prompts`
- Returns `GetPromptsResponse`
- Falls back to `DEFAULT_PROMPTS` when no config row exists

### PUT `/api/prompts`
- Body: `UpdatePromptsRequest` (`prompts`, `userEmail`)
- Response: `UpdatePromptsResponse`

### POST `/api/prompts/reset`
- Body: `ResetPromptsRequest` (`userEmail`)
- Response: `ResetPromptsResponse`

## Shared Types
- Requests/responses live under `shared/src/api/job-match.types.ts` and `shared/src/api/prompts.types.ts`
- `DEFAULT_PROMPTS` exported from `shared/src/config.types.ts`

## Frontend Clients
- `job-finder-FE/src/api/job-matches-client.ts` wraps the REST routes and polls during `subscribeToMatches`
- `job-finder-FE/src/api/prompts-client.ts` now issues HTTP calls instead of Firestore reads

## Testing & Verification
- Unit tests cover the clients (`job-matches-client.test.ts`, `prompts-client.test.ts`)
- Hook tests (`useGeneratorDocuments`, `usePersonalInfo`) mock the new API clients
- CI workflow (`pr-checks.yml`) runs `npm run test:unit --workspace job-finder-FE`
