> Status: Archived
> Owner: @jdubz
> Last Updated: 2025-10-15

# Structured Logging Schema Reference

**Location:** `src/logging.types.ts`  
**Package:** `@shared/types`

## StructuredLogEntry
Every service should emit log objects that extend the following interface:

```typescript
export interface StructuredLogEntry {
  category: LogCategory;          // 'worker', 'queue', 'pipeline', 'scrape', 'ai', 'database', 'api', 'auth', 'client', 'system'
  action: LogAction | string;     // Specific activity, e.g. 'started', 'completed', 'failed'
  message: string;                // Human readable summary
  requestId?: string;             // Correlates backend requests
  userId?: string;                // User identifier when applicable
  sessionId?: string;             // Frontend session identifier
  queueItemId?: string;           // Worker queue lineage
  environment?: 'development' | 'staging' | 'production';
  http?: HttpContext;             // Method, path, statusCode, duration
  details?: Record<string, unknown>;
  error?: ErrorContext;           // type, message, stack
  labels?: CloudLoggingLabels;    // Extra key/value metadata for Google Cloud Logging
}
```

Supporting types include:

- `LogCategory` and `LogAction` enums for consistent taxonomy.
- `CloudLoggingLabels` which extends `Record<string, string>` so it can be forwarded directly to Google Cloud Logging.
- `HttpContext`, `ErrorContext`, and queue-specific payloads for richer debugging.

## Versioning
- Bump the package minor version when adding optional fields.
- Bump the major version when changing required properties or enums.
- Update all consumers (backend, frontend, worker, app-monitor) after publishing a new version.

## Publishing Checklist
1. Run `npm run build` to generate `dist/`.
2. Update `CHANGELOG.md` with the schema changes.
3. Publish with `npm publish --access public`.
4. Coordinate dependency updates in each service repository.

Refer to each service’s structured logging runbook for implementation details.
