# GAP-DOC-API-1 — No API Documentation for Backend Endpoints

- **Status**: To Do
- **Owner**: Worker B
- **Priority**: P1 (High)
- **Labels**: priority-p1, repository-backend, type-documentation
- **Estimated Effort**: 2 days
- **Dependencies**: None
- **Related**: Identified in comprehensive gap analysis

## What This Issue Covers

Create comprehensive API documentation for all job-finder-BE Cloud Functions. Currently, there is **no API documentation** - frontend developers must read source code to understand endpoints.

## Context

**Current State**:

- No OpenAPI/Swagger specification
- No endpoint documentation
- No request/response examples
- No error code documentation
- **Result**: Frontend integration requires reading backend source code

**Impact**:

- Slow frontend development (must read backend code)
- Integration errors due to unclear contracts
- Difficult to onboard new developers
- No single source of truth for API
- Cannot generate client SDKs

**Why This Is P1 High**:

- Improves developer productivity
- Reduces integration bugs
- Industry standard practice
- Enables contract-first development
- Required for external integrations

## Tasks

### 1. Set Up OpenAPI Specification

- [ ] Install OpenAPI/Swagger tools
- [ ] Create `openapi.yaml` specification
- [ ] Document all HTTP endpoints
- [ ] Document all callable functions
- [ ] Add request/response schemas
- [ ] Document error responses

### 2. Generate Documentation Site

- [ ] Install Swagger UI or Redoc
- [ ] Configure documentation hosting
- [ ] Add code examples
- [ ] Add authentication documentation
- [ ] Deploy docs to Firebase Hosting

### 3. Document Endpoints

- [ ] Job queue endpoints (submit, status, cancel)
- [ ] Job matching endpoints (match, preferences)
- [ ] Company endpoints (CRUD operations)
- [ ] User profile endpoints
- [ ] Configuration endpoints
- [ ] Health check endpoint

### 4. Add Request/Response Examples

- [ ] Example requests for each endpoint
- [ ] Example success responses
- [ ] Example error responses
- [ ] cURL examples
- [ ] TypeScript/JavaScript examples

### 5. Document Authentication

- [ ] Authentication flow
- [ ] How to obtain tokens
- [ ] How to include auth in requests
- [ ] Token refresh process
- [ ] API key usage (for worker)

### 6. Keep Documentation in Sync

- [ ] Add JSDoc comments to functions
- [ ] Consider automated generation from code
- [ ] Add CI check for outdated docs
- [ ] Version documentation with releases

### 7. Create Developer Guide

- [ ] Getting started guide
- [ ] Common use cases
- [ ] Best practices
- [ ] Rate limiting guidelines
- [ ] Error handling guide

## Proposed Implementation

### OpenAPI Specification

```yaml
# job-finder-BE/docs/openapi.yaml
openapi: 3.0.3
info:
  title: Job Finder API
  description: Backend API for Job Finder application
  version: 1.0.0
  contact:
    name: Job Finder Team
    email: contact@joshwentworth.com

servers:
  - url: https://us-central1-static-sites-257923.cloudfunctions.net
    description: Production
  - url: http://localhost:5001/static-sites-257923/us-central1
    description: Local development

components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
      description: Firebase ID token

  schemas:
    Job:
      type: object
      required:
        - id
        - url
        - company
        - title
      properties:
        id:
          type: string
          description: Unique job identifier
        url:
          type: string
          format: uri
          description: Job posting URL
        company:
          type: string
          description: Company name
        title:
          type: string
          description: Job title
        description:
          type: string
          description: Job description
        postedDate:
          type: string
          format: date-time
        status:
          type: string
          enum: [pending, processed, matched, rejected]

    Error:
      type: object
      required:
        - error
        - message
      properties:
        error:
          type: string
          description: Error code
        message:
          type: string
          description: Human-readable error message
        details:
          type: object
          description: Additional error details

paths:
  /submitJob:
    post:
      summary: Submit a job for processing
      description: Add a new job to the processing queue
      operationId: submitJob
      security:
        - bearerAuth: []
      tags:
        - Jobs
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required:
                - url
                - userId
              properties:
                url:
                  type: string
                  format: uri
                  description: URL of the job posting
                userId:
                  type: string
                  description: ID of the user submitting the job
            examples:
              basic:
                value:
                  url: "https://example.com/jobs/123"
                  userId: "user-abc-123"

      responses:
        "200":
          description: Job submitted successfully
          content:
            application/json:
              schema:
                type: object
                properties:
                  success:
                    type: boolean
                  jobId:
                    type: string
                    description: ID of the created job
              examples:
                success:
                  value:
                    success: true
                    jobId: "job-xyz-789"

        "401":
          description: Unauthorized - Invalid or missing authentication
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Error"
              examples:
                unauthorized:
                  value:
                    error: "unauthorized"
                    message: "Invalid or missing authentication token"

        "403":
          description: Forbidden - User does not own this resource
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Error"

        "400":
          description: Bad Request - Invalid input
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Error"
              examples:
                invalidUrl:
                  value:
                    error: "validation_error"
                    message: "Invalid job URL"
                    details:
                      field: "url"
                      issue: "Must be a valid URL"

  /matchJobs:
    post:
      summary: Match jobs to user preferences
      description: Find jobs that match the user's criteria
      operationId: matchJobs
      security:
        - bearerAuth: []
      tags:
        - Matching
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required:
                - userId
                - preferences
              properties:
                userId:
                  type: string
                preferences:
                  type: object
                  properties:
                    keywords:
                      type: array
                      items:
                        type: string
                    locations:
                      type: array
                      items:
                        type: string
                    experienceLevel:
                      type: string
                      enum: [entry, mid, senior]

      responses:
        "200":
          description: Matching jobs found
          content:
            application/json:
              schema:
                type: object
                properties:
                  matches:
                    type: array
                    items:
                      $ref: "#/components/schemas/Job"
                  count:
                    type: integer

  /health:
    get:
      summary: Health check
      description: Check if the API is healthy
      operationId: healthCheck
      tags:
        - System
      responses:
        "200":
          description: API is healthy
          content:
            application/json:
              schema:
                type: object
                properties:
                  status:
                    type: string
                    example: healthy
                  timestamp:
                    type: string
                    format: date-time
```

### JSDoc Comments in Code

````typescript
// job-finder-BE/functions/src/functions/jobQueue.function.ts
/**
 * Submit a job for processing
 *
 * @remarks
 * This endpoint adds a new job to the processing queue. The job will be
 * analyzed and matched against user preferences.
 *
 * @param request - HTTP request with job data
 * @param request.body.url - URL of the job posting (required)
 * @param request.body.userId - ID of the user submitting (required)
 *
 * @returns Promise resolving to job submission result
 * @returns success - Whether submission succeeded
 * @returns jobId - ID of the created job
 *
 * @throws 401 - If user is not authenticated
 * @throws 403 - If userId doesn't match authenticated user
 * @throws 400 - If URL is invalid
 *
 * @example
 * ```typescript
 * const response = await fetch('/submitJob', {
 *   method: 'POST',
 *   headers: {
 *     'Authorization': `Bearer ${idToken}`,
 *     'Content-Type': 'application/json'
 *   },
 *   body: JSON.stringify({
 *     url: 'https://example.com/jobs/123',
 *     userId: 'user-abc-123'
 *   })
 * });
 * const data = await response.json();
 * console.log(data.jobId); // "job-xyz-789"
 * ```
 */
export const submitJob = onRequest(async (req, res) => {
  // Implementation
});
````

### Swagger UI Setup

```typescript
// job-finder-BE/functions/src/index.ts
import swaggerUi from "swagger-ui-express";
import YAML from "yamljs";

const swaggerDocument = YAML.load("./docs/openapi.yaml");

app.use(
  "/api-docs",
  swaggerUi.serve,
  swaggerUi.setup(swaggerDocument, {
    customCss: ".swagger-ui .topbar { display: none }",
    customSiteTitle: "Job Finder API Docs",
  }),
);
```

### Developer Guide

````markdown
# Job Finder API - Developer Guide

## Getting Started

### Authentication

All API endpoints require Firebase authentication. Obtain an ID token:

```typescript
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";

const auth = getAuth();
const userCredential = await signInWithEmailAndPassword(auth, email, password);
const idToken = await userCredential.user.getIdToken();
```
````

### Making Requests

Include the ID token in the Authorization header:

```typescript
const response = await fetch(`${API_BASE_URL}/submitJob`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${idToken}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    url: "https://example.com/jobs/123",
    userId: user.uid,
  }),
});

if (!response.ok) {
  const error = await response.json();
  throw new Error(error.message);
}

const data = await response.json();
```

## Common Use Cases

### Submit a Job

...

### Match Jobs to Preferences

...

### Get Job Status

...

## Error Handling

All errors follow a consistent format:

```json
{
  "error": "error_code",
  "message": "Human-readable message",
  "details": {
    // Additional context
  }
}
```

Common error codes:

- `unauthorized` - Invalid or missing authentication
- `forbidden` - User lacks permission
- `validation_error` - Invalid input data
- `not_found` - Resource doesn't exist
- `rate_limit_exceeded` - Too many requests

## Rate Limiting

- 100 requests per minute per user
- 429 status code when exceeded
- Retry-After header indicates wait time

## Best Practices

1. Always handle errors gracefully
2. Implement exponential backoff for retries
3. Cache ID tokens (refresh before expiry)
4. Validate input on client side
5. Use TypeScript types from job-finder-shared-types

````

## Acceptance Criteria
- [ ] Complete OpenAPI specification for all endpoints
- [ ] Swagger UI hosted and accessible
- [ ] All endpoints documented with examples
- [ ] Authentication flow documented
- [ ] Error responses documented
- [ ] Developer guide complete
- [ ] JSDoc comments in all function files
- [ ] Documentation stays in sync (CI check)

## Implementation Strategy

### Phase 1: OpenAPI Spec (1 day)
- Create openapi.yaml
- Document all endpoints
- Add schemas for requests/responses
- Add error definitions

### Phase 2: Documentation Site (0.5 days)
- Set up Swagger UI
- Add code examples
- Deploy to Firebase Hosting
- Test all examples

### Phase 3: Developer Guide (0.5 days)
- Write getting started guide
- Document common use cases
- Add troubleshooting section
- Create best practices guide

## Benefits
- **Faster Development**: Frontend devs don't need to read backend code
- **Fewer Bugs**: Clear contracts reduce integration errors
- **Better DX**: Developers can try API in browser
- **Onboarding**: New developers understand API quickly
- **SDK Generation**: Can auto-generate client libraries
- **Contract Testing**: Can validate responses match spec

## Dependencies Installation

```bash
cd job-finder-BE/functions
npm install --save swagger-ui-express yamljs
npm install --save-dev @types/swagger-ui-express @types/yamljs
````

## Related Issues

- GAP-SEC-AUTH-1: Document authentication requirements
- GAP-TEST-BE-1: Tests validate against OpenAPI spec
- All BE issues: Better documented API

## Documentation Best Practices

### Write for Your Audience

- Assume reader is a frontend developer
- Provide complete, runnable examples
- Explain authentication clearly
- Document edge cases and limitations

### Keep It Up to Date

- Update docs when changing endpoints
- Add CI check to detect drift
- Consider auto-generating from code
- Version docs with API versions

### Make It Discoverable

- Host at predictable URL (e.g., /api-docs)
- Link from README
- Include in onboarding materials
- Add to repository docs

## Tools to Consider

### Swagger UI (Recommended)

- Interactive documentation
- Try endpoints in browser
- Auto-generated from OpenAPI

### Redoc

- Clean, modern design
- Good for public APIs
- Static site generation

### TypeDoc

- Generate from TypeScript comments
- Good for TypeScript projects
- Can combine with OpenAPI

### Postman

- Create collection from OpenAPI
- Share with team
- Good for manual testing

## Notes

- Start with core endpoints, expand later
- Include frontend team in review
- Consider generating TypeScript client from spec
- Update docs as part of PR process
