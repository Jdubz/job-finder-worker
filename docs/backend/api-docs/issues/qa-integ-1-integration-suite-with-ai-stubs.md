> Status: Archived
> Owner: @jdubz
> Last Updated: 2025-11-18

# QA-INTEG-1 — Integration Test Suite with AI Stubs

- **Status**: Todo
- **Owner**: Worker B
- **Priority**: P1 (High Impact)
- **Labels**: priority-p1, repository-backend, type-testing, status-todo

## What This Issue Covers
Build a Firebase emulator-backed integration suite that exercises key Cloud Functions without calling paid AI providers. All configuration, scripts, and docs must live in `job-finder-BE` so contributors can run the suite locally and in CI.

## Tasks
1. **Test Harness Setup**
	- Configure Vitest (preferred for existing setup) or Jest to run in integration mode under `functions/`. Create a dedicated config `functions/vitest.integration.config.ts` that spins up the Firebase emulator using the `@firebase/rules-unit-testing` helpers.
	- Add npm scripts to `functions/package.json`: `test:integration` (single run) and `test:integration:watch`.
2. **AI Stubs and Dependency Injection**
	- In `functions/src/services/ai/`, introduce an interface (e.g., `TextGenerationClient`) and provide two implementations: `live` (calls OpenAI/Gemini using keys from `functions/config/ai.ts`) and `stub` (returns canned responses).
	- Create `functions/src/services/ai/factory.ts` that selects the stub when `process.env.USE_AI_STUBS === 'true'`.
	- For tests, set this env var in `vitest.integration.config.ts` so no external calls happen.
3. **Coverage Targets**
	- Author integration tests under `functions/test/integration/` covering:
	  - Generator callable (`generateDocument`): success, validation error, unauthorized access.
	  - Queue ingestion HTTP endpoint: ensures dedupe logic runs.
	  - Content CRUD endpoints: create, update, delete with Firestore assertions.
	- Use fixtures from `functions/test/fixtures/` and assert response shapes using `job-finder-shared-types` definitions.
4. **CI Integration**
	- Update `.github/workflows/ci.yml` to start Firebase emulator (use `firebase emulators:exec`) before running `npm run test:integration`.
	- Upload coverage summary (`functions/coverage/integration-summary.json`) as a workflow artifact. Add thresholds to fail the job if coverage dips below agreed levels.
	- Ensure workflow exports `USE_AI_STUBS=true` so tests stay isolated.
5. **Documentation**
	- Create `docs/testing/integration-suite.md` describing prerequisites (`npm install`, emulator install), commands, how to add new tests, and how stubs work.
	- Update `README.md` testing section with a pointer to the new doc and commands.

## Acceptance Criteria
- [ ] `npm run test:integration` executes locally using the Firebase emulator with stubs (no external API traffic).
- [ ] Integration tests cover generator, queue ingestion, and content services with both success and failure paths.
- [ ] GitHub Actions workflow runs the integration suite and uploads coverage artifacts.
- [ ] `docs/testing/integration-suite.md` and `README.md` document setup and usage.
- [ ] Issue includes a table summarizing covered endpoints and remaining gaps.

## Test Commands
- `npm run lint`
- `npm run test`
- `npm run test:integration`

## Useful Files
- `functions/package.json`
- `functions/src/services/ai/`
- `functions/test/integration/`
- `.github/workflows/ci.yml`
- `docs/testing/`
