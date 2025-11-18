# Structured Logging in job-finder-BE

**Last Updated:** 2025-10-28  
**Related Schema:** `@shared/types`

## Local Development
- Uses `functions/src/utils/local-logger.ts` to write JSON lines to `../logs/backend.log`.
- Ensure `npm install` has linked the latest shared-types package.
- Start the emulator suite via App Monitor or `npm run emulate`.

## Cloud Logging
- `functions/src/utils/cloud-logger.ts` wraps `@google-cloud/logging`.
- Automatic PII redaction runs before payloads are forwarded.
- Configure the following environment variables in Firebase:
  - `LOGGING_DEFAULT_PROJECT`
  - `LOGGING_SERVICE_NAME`
  - `LOGGING_SERVICE_VERSION`

## Usage Example
```typescript
import { createCloudLogger } from './utils/logger';

const logger = createCloudLogger();

logger.info({
  category: 'api',
  action: 'completed',
  message: 'User submitted job',
  requestId: req.headers['x-request-id'] as string,
  http: { method: req.method, path: req.path, statusCode: 200 },
});
```

## Verification
1. Run `npm run lint` to catch schema drift.
2. Execute `npm run test:logging` (coming soon) or App Monitor log tailing.
3. In staging, confirm entries appear in Google Cloud Logging with the correct labels.

For cross-service details see `docs/architecture/structured-logging-overview.md`.
