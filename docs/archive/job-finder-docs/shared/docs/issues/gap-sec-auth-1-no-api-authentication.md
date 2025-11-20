# GAP-SEC-AUTH-1 — No API Authentication on Backend Cloud Functions

- **Status**: To Do
- **Owner**: Worker A
- **Priority**: P0 (Critical)
- **Labels**: priority-p0, repository-backend, type-security, critical
- **Estimated Effort**: 2 days
- **Dependencies**: None
- **Related**: Identified in comprehensive gap analysis

## What This Issue Covers

Add authentication and authorization to all job-finder-BE Cloud Functions. Currently, **all Cloud Functions are publicly accessible** with no authentication, creating a critical security vulnerability.

## Context

**Current State**:

- All HTTP and callable Cloud Functions are public
- No API key validation
- No Firebase Auth verification
- No rate limiting
- **Result**: Anyone can call any endpoint without authentication

**Critical Security Risk**:

- Unauthorized access to job data
- Potential data manipulation
- DoS attack vector (unlimited requests)
- Privacy violations (access to user data)
- Could be abused for spam or malicious activity

**Why This Is P0 Critical**:

- Major security vulnerability
- Violates basic security principles
- Exposes sensitive user data
- Production-blocking issue
- Industry standard requirement

## Tasks

### 1. Implement Firebase Auth Verification

- [ ] Add Firebase Admin SDK auth verification
- [ ] Create middleware for auth checking
- [ ] Verify ID tokens on all protected endpoints
- [ ] Extract user UID from verified tokens
- [ ] Add role-based access control (RBAC)

### 2. Protect Callable Functions

- [ ] Update all callable functions to verify `context.auth`
- [ ] Return 401 for unauthenticated requests
- [ ] Add user ownership validation (users can only access their data)
- [ ] Document authentication requirements

### 3. Protect HTTP Functions

- [ ] Add Authorization header validation
- [ ] Verify Bearer tokens
- [ ] Return 401 for missing/invalid tokens
- [ ] Add CORS configuration for authenticated requests

### 4. Add API Key for Service-to-Service

- [ ] Generate API keys for worker → backend communication
- [ ] Store API keys in Secret Manager
- [ ] Validate API keys for service endpoints
- [ ] Rotate API keys regularly

### 5. Add Rate Limiting

- [ ] Implement rate limiting per user/IP
- [ ] Add Firebase App Check for abuse prevention
- [ ] Configure limits (e.g., 100 requests/minute per user)
- [ ] Return 429 Too Many Requests when exceeded

### 6. Update Tests

- [ ] Add authentication tests
- [ ] Test unauthorized access (should fail)
- [ ] Test authorized access (should succeed)
- [ ] Test role-based permissions
- [ ] Test API key validation

### 7. Documentation

- [ ] Document authentication flow
- [ ] Add examples for frontend integration
- [ ] Document API key usage for worker
- [ ] Update API documentation with auth requirements

## Proposed Implementation

### Auth Middleware

```typescript
// src/middleware/auth.ts
import { auth } from "firebase-admin";
import { Request, Response, NextFunction } from "express";

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const token = authHeader.split("Bearer ")[1];

  try {
    const decodedToken = await auth().verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid token" });
  }
}
```

### Protected HTTP Function

```typescript
// src/functions/jobQueue.function.ts
import { onRequest } from "firebase-functions/v2/https";
import { requireAuth } from "../middleware/auth";

export const submitJob = onRequest(async (req, res) => {
  // Verify authentication
  await requireAuth(req, res, () => {});

  if (!req.user) {
    return; // Already handled by middleware
  }

  // Verify user owns the data
  const userId = req.user.uid;
  const jobData = req.body;

  if (jobData.userId !== userId) {
    return res.status(403).json({ error: "Forbidden" });
  }

  // Process job...
});
```

### Protected Callable Function

```typescript
// src/functions/jobMatching.function.ts
import { onCall } from "firebase-functions/v2/https";

export const matchJobs = onCall(async (request) => {
  // Verify authentication
  if (!request.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "User must be authenticated",
    );
  }

  const userId = request.auth.uid;
  const { preferences } = request.data;

  // Verify user owns the data
  if (preferences.userId !== userId) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "User can only access own data",
    );
  }

  // Match jobs...
});
```

### API Key Validation (Service-to-Service)

```typescript
// src/middleware/apiKey.ts
import { Request, Response, NextFunction } from "express";
import { getSecret } from "../utils/secrets";

export async function requireApiKey(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const apiKey = req.headers["x-api-key"];
  const validApiKey = await getSecret("WORKER_API_KEY");

  if (!apiKey || apiKey !== validApiKey) {
    return res.status(401).json({ error: "Invalid API key" });
  }

  next();
}

// Usage for worker endpoints
export const processJobQueue = onRequest(async (req, res) => {
  await requireApiKey(req, res, () => {});
  // Process queue...
});
```

### Rate Limiting

```typescript
// src/middleware/rateLimit.ts
import rateLimit from "express-rate-limit";

export const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      error: "Too many requests, please try again later.",
    });
  },
});

// Apply to all routes
app.use("/api/", apiLimiter);
```

## Acceptance Criteria

- [ ] All Cloud Functions require authentication
- [ ] Unauthorized requests return 401
- [ ] Users can only access their own data (403 for others)
- [ ] API key authentication works for worker
- [ ] Rate limiting prevents abuse
- [ ] All auth flows have tests (100% coverage)
- [ ] Documentation complete with examples
- [ ] No security vulnerabilities in auth code

## Implementation Strategy

### Phase 1: Auth Infrastructure (0.5 days)

- Set up auth middleware
- Configure Firebase Admin SDK
- Add Secret Manager for API keys

### Phase 2: Protect Endpoints (1 day)

- Add auth to all callable functions
- Add auth to all HTTP functions
- Implement user ownership validation
- Add API key validation for worker

### Phase 3: Rate Limiting (0.5 days)

- Implement rate limiting
- Configure Firebase App Check
- Test abuse scenarios

### Phase 4: Testing & Documentation (0.5 days)

- Write comprehensive auth tests
- Document authentication flow
- Update API documentation
- Add frontend integration examples

## Benefits

- **Security**: Prevents unauthorized access to data
- **Privacy**: Protects user information
- **Compliance**: Meets security standards
- **Abuse Prevention**: Rate limiting prevents DoS
- **Auditability**: Track who accesses what
- **Trust**: Users can trust their data is secure

## Dependencies Installation

```bash
cd job-finder-BE/functions
npm install --save \
  express-rate-limit \
  firebase-admin

npm install --save-dev \
  @types/express-rate-limit
```

## Related Issues

- GAP-TEST-BE-1: Backend test coverage (tests for auth)
- GAP-DOC-API-1: API documentation (document auth requirements)
- BE-WORKFLOW-2: CI optimization (add security checks)

## Security Considerations

### Firebase Auth Best Practices

1. Always verify ID tokens server-side
2. Never trust client-provided user IDs
3. Use short-lived tokens (1 hour default)
4. Implement token refresh on frontend
5. Use Firebase App Check for abuse prevention

### API Key Management

1. Store keys in Secret Manager (never in code)
2. Rotate keys every 90 days
3. Use separate keys per environment
4. Log all API key usage
5. Revoke compromised keys immediately

### Rate Limiting Strategy

1. Per-user limits: 100 req/min (normal usage)
2. Per-IP limits: 1000 req/min (prevents single source DoS)
3. Global limits: 10k req/min (infrastructure protection)
4. Exponential backoff for repeated violations
5. Whitelist for internal services

## Testing Checklist

- [ ] Unauthenticated request returns 401
- [ ] Invalid token returns 401
- [ ] Expired token returns 401
- [ ] Valid token allows access
- [ ] User can access own data
- [ ] User cannot access other user's data (403)
- [ ] API key works for worker endpoints
- [ ] Invalid API key returns 401
- [ ] Rate limit enforced (429 after limit)
- [ ] Rate limit resets after window

## Notes

- This is **CRITICAL** for production deployment
- Cannot launch without authentication
- Security audit recommended after implementation
- Consider security review by external expert
- Monitor for auth failures in production
