# Route Tests

This directory contains integration tests for API routes that don't belong to a specific module.

## Files

### `applicator.routes.test.ts`
Tests for the `/api/applicator/profile` endpoint that provides pre-formatted profile data for the job-applicator desktop app.

**Coverage:**
- Personal information formatting
- EEO information handling (including decline_to_identify filtering)
- Work history with hierarchical structure (companies, roles, highlights)
- Education history
- Skills aggregation and deduplication
- Date-based sorting (most recent first)
- Empty profile edge cases
- Section separators

**Test Pattern:**
- Uses in-memory SQLite database
- Clears database between tests
- Mocks authenticated user via middleware
- Tests both happy paths and edge cases

## Running Tests

```bash
# Run all route tests
npm test -- src/routes/__tests__

# Run applicator tests only
npm test -- src/routes/__tests__/applicator.routes.test.ts

# Run with coverage
npm test -- --coverage src/routes/__tests__/applicator.routes.test.ts
```
