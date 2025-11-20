> Status: Draft
> Owner: @frontend
> Last Updated: 2025-11-19

# Frontend GIS Migration Plan

_Last updated: November 19, 2025_

This plan captures the work required to remove Firebase Auth/App Check from the React frontend and rely solely on Google Identity Services (GIS) tokens, which the Node API already validates via SQLite roles. It is the final blocker for completing MIG-008 (Firebase retirement).

## 1. Goals
- Drop `firebase/app`, `firebase/auth`, and `firebase/app-check` dependencies from the frontend bundle.
- Load GIS (`accounts.google.com/gsi/client`) dynamically and surface a reusable hook/context that exposes the signed-in user and ID token.
- Ensure every API call includes the GIS ID token (mirrors existing `auth` header usage) while preserving App Check-like protection via backend verification only.
- Update integration/unit tests to stub GIS flows instead of Firebase emulators.
- Remove emulator/config docs that instruct contributors to install `firebase-tools` for frontend work.

## 2. Implementation Steps
1. **Bootstrap GIS loader**
   - Create `src/lib/gis.ts` that injects the GIS script, initializes `google.accounts.id.initialize`, and exposes helpers for prompting the user.
   - Add an env var (`VITE_GOOGLE_OAUTH_CLIENT_ID`) sourced from the same value the backend already uses.
2. **Auth context rewrite**
   - Replace `AuthContext` + `AuthModal` usage of `firebase/auth` with GIS sign-in/sign-out helpers.
   - Persist the GIS credential in memory/localStorage as needed for page refresh; ensure logout clears it.
   - Update `BaseApiClient` to fetch the GIS token from the new auth store before each request.
3. **App Check removal**
   - Delete `firebase/app-check` usage; rely on backend verification + Cloudflared.
4. **Forms/tests**
   - Update Vitest setup to mock the GIS helpers instead of Firebase mocks.
   - Remove `.env.test` Firebase vars; replace with the GIS client ID + fake tokens.
5. **Docs + tooling**
   - Update `job-finder-FE/tests/README.md`, `docs/frontend/*`, and root README to remove Firebase emulator instructions.
   - Drop `firebase.json`/`.firebaserc` references once GIS auth is live (Firebase Hosting still uses those files for rewrites, so this becomes part of the hosting-only workflow doc).

## 3. Dependencies & Risks
- Needs coordination with backend to ensure GIS client ID is available in the frontend build pipeline (GitHub Actions + local `.env`).
- Watch for popup blockers when migrating from Firebase `signInWithPopup` to GIS one-tap/redirect flows; document fallback.
- Update CSP / meta tags on Firebase Hosting if GIS requires extra directives.

## 4. Acceptance Criteria
- `npm run lint:frontend` and `npm run test:integration --workspace job-finder-FE` pass without any Firebase modules installed.
- `git grep firebase` inside `job-finder-FE/src` returns no matches.
- Frontend README/tests docs no longer mention Firebase emulators or `firebase-tools` install steps.
- MIG-008 checklist updated to mark “Frontend GIS swap” complete.
