# Backend Testing Guide

> Status: Active
> Owner: @jdubz
> Last Updated: 2026-01-27

## Overview

This guide covers comprehensive testing for job-finder backend services. **SQLite is the sole datastore** - Firestore was fully migrated away from in late 2025. Currently there is minimal test coverage, creating critical risk of deploying broken code to production.

**Note:** Firebase Authentication is still used for user authentication, but Firestore (database) is completely removed.

## Context

**Current State**:

- Sparse unit/integration coverage
- No smoke tests after deployment
- **Result**: Cannot verify functions work before deploying

**Critical Risk**:

- Breaking changes deployed to production
- API contract violations undetected
- Data corruption possible
- No safety net for refactoring

## Test Structure

```
job-finder-BE/
├── server/
│   ├── src/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── db/
│   │   ├── test/           # Test setup and helpers
│   │   └── utils/
│   └── vitest.config.ts
```

**Test file locations:**
- Unit tests: `src/routes/__tests__/` or `src/services/__tests__/`
- Integration tests: `src/routes/__tests__/*.integration.test.ts`
- Test helpers: `src/test/`

## Setup Procedures

### 1. Install Testing Dependencies

**Note:** The backend already uses Vitest. These dependencies should already be installed. If setting up from scratch:

```bash
cd job-finder-BE/server
npm install --save-dev \
  vitest \
  @vitest/ui \
  supertest \
  @types/supertest
```

### 2. Configure Vitest

The backend uses Vitest with config in `vitest.config.ts`. Example configuration:

```typescript
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/test/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/mockData.ts'
      ]
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  }
})
```

### 3. Set Up Test Environment

Configure test environment variables in `.env.test` or test setup files. 

**Note:** Firebase Admin SDK mocking is only needed if testing Firebase Authentication flows, not for data storage (which uses SQLite).

### 4. Create Test Helpers

Set up common test fixtures, mock data, and SQLite database helpers in the `src/test/` directory (matching the existing structure in `job-finder-BE/server/src/test/`).

## Unit Tests

### Example: Contract Test with Vitest

```typescript
// src/modules/job-queue/__tests__/job-queue.contract.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'
import { queueItemSchema } from '@shared/types'
import { buildJobQueueRouter } from '../job-queue.routes'
import { getDb } from '../../../db/sqlite'
import { apiErrorHandler } from '../../../middleware/api-error'

const createApp = () => {
  const app = express()
  app.use(express.json())
  app.use('/queue', buildJobQueueRouter())
  app.use(apiErrorHandler)
  return app
}

describe('job queue contract', () => {
  const db = getDb()
  const app = createApp()

  beforeEach(() => {
    db.prepare('DELETE FROM job_queue').run()
  })

  it('serializes list responses according to shared schema', async () => {
    const submitRes = await request(app).post('/queue/jobs').send({
      url: 'https://example.com/test',
      companyName: 'Test Co',
    })

    expect(submitRes.status).toBe(201)

    const res = await request(app).get('/queue?limit=5')
    expect(res.status).toBe(200)
    const parsed = queueItemSchema.array().safeParse(res.body.data.items)
    expect(parsed.success).toBe(true)
  })
})
```

### Coverage Targets

- Contract tests for all API routes (testing shared schema compliance)
- Repository tests for database operations
- Service tests for business logic
- Middleware tests for authentication and error handling
- **Target: 70%+ code coverage**

**Current test locations:**
- `src/modules/*/\_\_tests\_\_/*.contract.test.ts` - API contract tests
- `src/modules/*/\_\_tests\_\_/*.repository.test.ts` - Repository tests
- `src/modules/*/\_\_tests\_\_/*.routes.test.ts` - Route handler tests
- `src/services/*.test.ts` - Service tests

## Integration Tests

Integration tests verify end-to-end flows including database operations.

### Example: Repository Integration Test

```typescript
// src/modules/job-queue/__tests__/job-queue.repository.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { getDb } from '../../../db/sqlite'
import { JobQueueRepository } from '../job-queue.repository'

describe('JobQueueRepository', () => {
  const db = getDb()
  const repo = new JobQueueRepository()

  beforeEach(() => {
    db.prepare('DELETE FROM job_queue').run()
  })

  it('creates and retrieves queue items', () => {
    const item = repo.create({
      url: 'https://example.com/job',
      companyName: 'Test Company',
      status: 'pending'
    })

    expect(item.id).toBeDefined()
    
    const retrieved = repo.getById(item.id)
    expect(retrieved?.url).toBe('https://example.com/job')
  })
})
```
  });

  it("should accept job submission", async () => {
    const result = await testEnv.functions.submitJob(mockJobData);

    expect(result.success).toBe(true);
    expect(result.jobId).toBeDefined();
  });
});
```

### Coverage Targets

- Test callable functions with Firebase emulators
- Test HTTP functions with supertest
- Test authentication/authorization flows
- Test error handling
- Test data validation
- **Target: All endpoints covered**

## Implementation Strategy

### Phase 1: Infrastructure (1 day)

- Set up Jest and Firebase emulators
- Create test helpers and mocks
- Configure CI integration

### Phase 2: Unit Tests (2 days)

- Test core business logic
- Test data validation
- Test utilities and helpers
- Aim for 70%+ coverage

### Phase 3: Integration Tests (1 day)

- Test API endpoints end-to-end
- Test authentication flows
- Test error handling

### Phase 4: Documentation (0.5 days)

- Write testing guide
- Document test patterns
- Add examples

## CI Integration

Update `.github/workflows/ci.yml`:

- Run tests before build
- Fail CI if tests fail
- Report coverage metrics

## Benefits

- **Safety**: Can verify changes don't break functionality
- **Confidence**: Deploy with confidence knowing tests pass
- **Refactoring**: Safe to improve code structure
- **Documentation**: Tests document expected behavior
- **Debugging**: Faster to identify root causes
- **Regression Prevention**: Catch bugs before production

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run with coverage
npm test -- --coverage

# Run specific test file
npm test -- jobQueue.test.ts
```

## Best Practices

- Write tests alongside new features
- Test edge cases and error conditions
- Keep tests isolated and independent
- Use descriptive test names
- Mock external dependencies
- Maintain test data fixtures
- Review test quality in code reviews
