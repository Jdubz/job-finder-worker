# MIG-2 — Generator & Content Services Port

- **Status**: ✅ COMPLETED 2025-10-20 (commit 8c14187)
- **Owner**: Worker B
- **Priority**: P1 (High Impact)
- **Labels**: priority-p1, repository-backend, type-migration, status-completed

## What This Issue Covers
Finish porting the document generator and content services into the new Cloud Functions codebase, including template assets, validation, AI integrations, and tests. All deliverables must live in `job-finder-BE` so future contributors can run them without external context.

## Tasks
1. **Template and Asset Migration**
   - Audit the legacy repository (see `docs/archive/portfolio-reference.md` if available) and list remaining template files required for cover letters and experience summaries.
   - Add templates under `functions/src/templates/` with clear naming and inline comments describing expected variables.
   - Update `functions/src/templates/index.ts` to export loaders for each template and add Jest tests ensuring they render with sample data (fixtures under `functions/test/fixtures/templates/`).
2. **Implement Endpoints**
   - For each callable in `functions/src/modules/generator/` (`generateDocument`, `listHistory`, etc.), ensure request schemas use `zod` definitions from `functions/src/shared/validation.ts` and responses are typed with `job-finder-shared-types` models.
   - Implement content CRUD endpoints in `functions/src/modules/content/` with Firestore access via `functions/src/db/contentRepository.ts`. Add optimistic concurrency guards where needed.
   - Update `API.md` with endpoint descriptions, request/response examples pulled from tests.
3. **AI Service Integration**
   - Wrap external AI providers behind interfaces in `functions/src/services/ai/` with implementations reading API keys from `functions/config/ai.ts` (populated via `functions/.env.example`).
   - Provide emulator-safe stubs under `functions/src/services/ai/__mocks__/` that return deterministic content. Ensure the code switches to stubs when `process.env.USE_AI_STUBS === 'true'`.
4. **Testing & Tooling**
   - Add unit tests for new modules and integration tests using Firebase emulator (command `npm run test:integration`). Tests must cover success, validation errors, and unauthorized access (tie into BE-SEC-1 guards).
   - Update GitHub Actions workflow to run the integration suite with AI stubs enabled.
   - Generate coverage reports stored under `functions/coverage/` (gitignored) and summarize key metrics in this issue.
5. **Deployment & Verification**
   - Deploy updated functions to staging using `npm run deploy:staging`.
   - Execute smoke scripts (`functions/test/smoke/generatorSmoke.test.ts`) against staging with real credentials toggled on. Document observed latencies, errors, and Firestore writes in a “Staging Validation” section here.

## Acceptance Criteria
- [ ] Template inventory table and rendered sample outputs committed (under `functions/test/fixtures/templates/`).
- [ ] Generator and content endpoints implemented with validated inputs and typed outputs.
- [ ] AI service abstraction supports live and stubbed modes; emulator tests use stubs.
- [ ] Integration tests run in CI and pass locally (`npm run test:integration`).
- [ ] `API.md` and `functions/.env.example` updated to describe new configuration.
- [ ] Staging deployment executed with results documented in this issue.

## Test Commands
- `npm run lint`
- `npm run test`
- `npm run test:integration`
- `npm run deploy:staging`

## Useful Files
- `functions/src/modules/generator/`
- `functions/src/modules/content/`
- `functions/src/services/ai/`
- `API.md`
- `functions/test/`
