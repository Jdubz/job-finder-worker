# FE-BUG-3 — Enhanced Error Handling UX

- **Status**: Todo
- **Owner**: Worker B
- **Priority**: P1 (High Impact)
- **Labels**: priority-p1, repository-frontend, type-bug, status-todo

## Goal

Give users actionable feedback when operations fail by introducing consistent error boundaries, notifications, and retry flows. Implementation must rely solely on the code inside `job-finder-FE`.

## Required Changes

1. **Global Error Boundary**
   - Create `src/components/system/ErrorBoundary.tsx` implementing `componentDidCatch` and rendering a fallback UI with a “Reload” action.
   - Wrap the root router in `src/main.tsx` (or `src/App.tsx`) so runtime errors never result in a blank screen.
2. **Toast Notifications**
   - Add a lightweight toast library (e.g., `sonner` or `react-hot-toast`) to `package.json` and render its provider inside `MainLayout`.
   - Expose a hook `src/hooks/useToast.ts` that standardizes success/error/info messages for reuse.
3. **Retriable Operations**
   - Identify critical mutations handled in `src/pages/job-finder/JobFinderPage.tsx` and `src/pages/document-builder/DocumentBuilderPage.tsx`.
   - Ensure failures trigger toasts with retry buttons that re-execute the original action when clicked.
   - Disable submission buttons while requests are in flight to prevent duplicates.
4. **Logging**
   - Enhance `src/api/base-client.ts` error handling to include endpoint, HTTP status, and request ID (if present). Keep the implementation console-based so contributors without observability tooling can debug.
5. **Documentation & Tests**
   - Add unit tests in `src/__tests__/` covering the new error boundary and toast hook.
   - Create `docs/ui/error-handling.md` describing error patterns, retry behavior, and accessibility considerations.

## Acceptance Criteria

- [ ] Global error boundary wraps the router and displays a friendly fallback for unhandled exceptions.
- [ ] Toast notifications appear on success/error of key API calls and include retry actions where appropriate.
- [ ] Retry logic for job submission and document generation works end-to-end (manual notes added to issue).
- [ ] Accessibility checked: toasts announce via ARIA live region and focus management remains intact.
- [ ] `npm run lint` and `npm run test` pass after changes.

## Suggested Commands

- `npm install <toast-library>`
- `npm run lint`
- `npm run test`
- `npm run dev` (simulate network failures using browser dev tools > Offline)

## Helpful Files Inside This Repo

- `src/api/base-client.ts`
- `src/pages/job-finder/JobFinderPage.tsx`
- `src/pages/document-builder/DocumentBuilderPage.tsx`
- `src/components/layout/MainLayout.tsx`
