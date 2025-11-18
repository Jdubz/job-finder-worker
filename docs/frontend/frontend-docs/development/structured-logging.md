# Structured Logging in job-finder-FE

**Last Updated:** 2025-10-28  
**Client Logger:** `src/lib/logger.ts`

## Local Development
- The browser logger sends JSON payloads to App Monitor (`http://localhost:5000/api/logs/frontend`).
- Session IDs are generated and persisted via `sessionStorage`.
- Use App Monitor’s Logs panel to view real-time frontend logs.

## Production/Staging
- TODO: wire `logError()` forwarding to Cloud Logging via App Monitor backend (pending deployment).
- Ensure environment variables expose the App Monitor endpoint or Cloud Logging sink.

## Example
```typescript
import { logger, logError } from '@/lib/logger';

logger.info({
  category: 'client',
  action: 'page_view',
  message: 'Dashboard visited',
  sessionId: getSessionId(),
  details: { path: location.pathname },
});

try {
  await api.fetchJobs();
} catch (error) {
  logError('Failed to fetch jobs', error, { action: 'fetch_jobs' });
}
```

## Verification
1. Run the frontend through App Monitor and confirm logs appear under “Frontend”.
2. Inspect network requests for `/api/logs/frontend` to ensure payload schema matches shared-types.
3. When Cloud Logging forwarding is enabled, verify entries in GCP with `service=frontend`.

See `docs/architecture/structured-logging-overview.md` for cross-repo context.
