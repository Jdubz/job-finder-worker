# Job Queue API Documentation

Complete API reference for the Job Queue Cloud Function.

## Base URL

```
Production: https://us-central1-<project-id>.cloudfunctions.net/manageJobQueue
Staging: https://us-central1-<project-id>.cloudfunctions.net/manageJobQueue
Development: http://localhost:5001/<project-id>/us-central1/manageJobQueue
```

## Authentication

Most endpoints require Firebase Authentication. Include the Firebase ID token in the `Authorization` header:

```
Authorization: Bearer <firebase-id-token>
```

### Authentication Levels

- **Public**: No authentication required
- **User**: Any authenticated user
- **Editor**: Authenticated user with `editor` role in custom claims or verified email

## Common Response Format

### Success Response
```json
{
  "success": true,
  "data": { ... },
  "requestId": "uuid-v4",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### Error Response
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": { ... }
  },
  "requestId": "uuid-v4",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

## Endpoints

### Health Check

#### GET /

Check if the API is running and get service information.

**Authentication**: Public

**Response**:
```json
{
  "success": true,
  "data": {
    "service": "Job Queue API",
    "version": "1.0.0",
    "status": "healthy",
    "timestamp": "2024-01-15T10:30:00Z"
  }
}
```

---

### Job Queue Submission

#### POST /submit-job

Submit a job posting URL to the queue for processing.

**Authentication**: User

**Request Body**:
```json
{
  "url": "https://example.com/careers/software-engineer",
  "companyName": "Example Corp",
  "generationId": "gen-123" // Optional: If documents already generated
}
```

**Validation Rules**:
- `url` (required): Valid HTTP/HTTPS URL
- `companyName` (optional): String, max 200 characters
- `generationId` (optional): String, indicates pre-generated documents

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "queue-item-id",
    "type": "job",
    "status": "pending",
    "url": "https://example.com/careers/software-engineer",
    "company_name": "Example Corp",
    "submitted_by": "user-uid",
    "created_at": "2024-01-15T10:30:00Z",
    "retry_count": 0,
    "max_retries": 3
  }
}
```

**Error Codes**:
- `UNAUTHENTICATED`: Missing or invalid authentication
- `VALIDATION_ERROR`: Invalid request body
- `INTERNAL_ERROR`: Server error

**Example**:
```bash
curl -X POST https://us-central1-project.cloudfunctions.net/manageJobQueue/submit-job \
  -H "Authorization: Bearer $FIREBASE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://greenhouse.io/company/careers/123",
    "companyName": "Tech Startup Inc"
  }'
```

---

#### POST /submit-company

Submit a company website for analysis and job source discovery.

**Authentication**: Editor

**Request Body**:
```json
{
  "companyName": "Tech Startup Inc",
  "websiteUrl": "https://techstartup.com",
  "source": "manual_submission"
}
```

**Validation Rules**:
- `companyName` (required): String, 1-200 characters
- `websiteUrl` (required): Valid HTTP/HTTPS URL
- `source` (required): One of: `user_submission`, `automated_scan`, `scraper`, `webhook`, `email`, `manual_submission`, `user_request`

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "queue-item-id",
    "type": "company",
    "status": "pending",
    "url": "https://techstartup.com",
    "company_name": "Tech Startup Inc",
    "source": "manual_submission",
    "submitted_by": "editor-uid",
    "company_sub_task": "fetch",
    "created_at": "2024-01-15T10:30:00Z"
  }
}
```

**Error Codes**:
- `FORBIDDEN`: User lacks editor role
- `VALIDATION_ERROR`: Invalid request body

---

#### POST /submit-scrape

Submit a scrape request to search for matching jobs across all sources.

**Authentication**: User

**Request Body**:
```json
{
  "scrapeConfig": {
    "target_matches": 10,
    "max_sources": 50,
    "source_ids": ["source-1", "source-2"],
    "min_match_score": 70
  }
}
```

**Validation Rules**:
- `scrapeConfig` (optional): Object
  - `target_matches` (optional): Integer, 1-100, stop after finding N matches
  - `max_sources` (optional): Integer, 1-500, maximum sources to scrape
  - `source_ids` (optional): Array of strings, specific source IDs
  - `min_match_score` (optional): Integer, 0-100, minimum match threshold

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "queue-item-id",
    "type": "scrape",
    "status": "pending",
    "scrape_config": {
      "target_matches": 10,
      "max_sources": 50
    },
    "submitted_by": "user-uid",
    "created_at": "2024-01-15T10:30:00Z"
  }
}
```

**Rate Limiting**:
- Users can only have 1 pending scrape request at a time
- Attempting concurrent scrapes returns `429 RATE_LIMIT` error

**Error Codes**:
- `RATE_LIMIT`: User already has pending scrape request
- `VALIDATION_ERROR`: Invalid configuration values

---

### Queue Status

#### GET /queue-status/:id

Get the current status of a queue item.

**Authentication**: User

**URL Parameters**:
- `id` (required): Queue item ID

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "queue-item-id",
    "type": "job",
    "status": "processing",
    "url": "https://example.com/job/123",
    "company_name": "Example Corp",
    "retry_count": 0,
    "created_at": "2024-01-15T10:30:00Z",
    "updated_at": "2024-01-15T10:31:00Z",
    "processed_at": "2024-01-15T10:31:00Z"
  }
}
```

**Status Values**:
- `pending`: Waiting in queue
- `processing`: Currently being processed
- `success`: Successfully completed
- `failed`: Processing failed
- `skipped`: Skipped (duplicate or blocked)
- `filtered`: Rejected by filter engine

**Error Codes**:
- `NOT_FOUND`: Queue item doesn't exist or user lacks permission

---

#### GET /queue-stats

Get comprehensive queue statistics.

**Authentication**: Editor

**Response**:
```json
{
  "success": true,
  "data": {
    "total": 1523,
    "pending": 42,
    "processing": 8,
    "success": 1401,
    "failed": 72,
    "byType": {
      "job": 1200,
      "company": 250,
      "scrape": 73
    }
  }
}
```

---

### Queue Management

#### POST /retry-item/:id

Retry a failed queue item.

**Authentication**: Editor

**URL Parameters**:
- `id` (required): Queue item ID

**Response**:
```json
{
  "success": true,
  "message": "Queue item retry initiated successfully",
  "data": {
    "queueItemId": "item-id",
    "newStatus": "pending",
    "retryCount": 2
  }
}
```

**Requirements**:
- Item must have status `failed`
- `retry_count` must be less than `max_retries`

**Error Codes**:
- `NOT_FOUND`: Queue item doesn't exist
- `INVALID_STATUS`: Can only retry failed items
- `MAX_RETRIES_EXCEEDED`: Item has reached maximum retries

---

#### DELETE /delete-item/:id

Delete a queue item.

**Authentication**: Editor

**URL Parameters**:
- `id` (required): Queue item ID

**Response**:
```json
{
  "success": true,
  "message": "Queue item deleted successfully"
}
```

---

### Configuration Management

#### GET /stop-list

Get the current stop list configuration.

**Authentication**: Editor

**Response**:
```json
{
  "success": true,
  "data": {
    "excludedCompanies": ["Bad Company Inc", "Scam Corp"],
    "excludedKeywords": ["unpaid", "commission-only", "crypto"],
    "excludedDomains": ["spam.com", "scam.net"],
    "updatedAt": "2024-01-15T10:30:00Z",
    "updatedBy": "editor@example.com"
  }
}
```

---

#### PUT /stop-list

Update the stop list configuration.

**Authentication**: Editor

**Request Body**:
```json
{
  "excludedCompanies": ["Bad Company Inc"],
  "excludedKeywords": ["unpaid", "commission-only"],
  "excludedDomains": ["spam.com"]
}
```

**Validation Rules**:
- All fields optional (missing fields won't be updated)
- Each field must be an array of strings
- Maximum 1000 entries per field
- Each string max 200 characters

**Response**:
```json
{
  "success": true,
  "message": "Stop list updated successfully",
  "data": {
    "excludedCompanies": 1,
    "excludedKeywords": 2,
    "excludedDomains": 1
  }
}
```

---

#### POST /check-stop-list

Check if a job would be blocked by the stop list.

**Authentication**: User

**Request Body**:
```json
{
  "companyName": "Example Corp",
  "url": "https://example.com/job/123"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "isExcluded": false,
    "reason": null
  }
}
```

**Blocked Example**:
```json
{
  "success": true,
  "data": {
    "isExcluded": true,
    "reason": "domain"
  }
}
```

**Reason Values**:
- `null`: Not blocked
- `domain`: URL domain is in excluded domains
- `company`: Company name matches excluded companies
- `keyword`: Company name contains excluded keyword

---

#### GET /ai-settings

Get AI configuration settings.

**Authentication**: Editor

**Response**:
```json
{
  "success": true,
  "data": {
    "provider": "claude",
    "model": "claude-3-5-sonnet-20241022",
    "minMatchScore": 70,
    "costBudgetDaily": 10.0,
    "updatedAt": "2024-01-15T10:30:00Z",
    "updatedBy": "editor@example.com"
  }
}
```

---

#### PUT /ai-settings

Update AI configuration settings.

**Authentication**: Editor

**Request Body**:
```json
{
  "provider": "claude",
  "model": "claude-3-5-sonnet-20241022",
  "minMatchScore": 75,
  "costBudgetDaily": 15.0
}
```

**Validation Rules**:
- `provider`: One of `claude`, `openai`, `gemini`
- `model`: String, valid model name for provider
- `minMatchScore`: Integer, 0-100
- `costBudgetDaily`: Float, >= 0

**Response**:
```json
{
  "success": true,
  "message": "AI settings updated successfully"
}
```

---

#### GET /queue-settings

Get queue configuration settings.

**Authentication**: Editor

**Response**:
```json
{
  "success": true,
  "data": {
    "maxRetries": 3,
    "retryDelaySeconds": 300,
    "processingTimeout": 3600,
    "updatedAt": "2024-01-15T10:30:00Z",
    "updatedBy": "editor@example.com"
  }
}
```

---

#### PUT /queue-settings

Update queue configuration settings.

**Authentication**: Editor

**Request Body**:
```json
{
  "maxRetries": 5,
  "retryDelaySeconds": 600,
  "processingTimeout": 7200
}
```

**Validation Rules**:
- `maxRetries`: Integer, 1-10
- `retryDelaySeconds`: Integer, >= 0
- `processingTimeout`: Integer, >= 60

**Response**:
```json
{
  "success": true,
  "message": "Queue settings updated successfully"
}
```

---

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNAUTHENTICATED` | 401 | Missing or invalid authentication token |
| `FORBIDDEN` | 403 | User lacks required permissions (editor role) |
| `NOT_FOUND` | 404 | Resource not found or user lacks access |
| `VALIDATION_ERROR` | 400 | Request validation failed |
| `RATE_LIMIT` | 429 | Too many requests or concurrent operation limit reached |
| `INTERNAL_ERROR` | 500 | Server error occurred |
| `INVALID_STATUS` | 400 | Operation not allowed for current item status |
| `MAX_RETRIES_EXCEEDED` | 400 | Item has reached maximum retry limit |
| `METHOD_NOT_ALLOWED` | 405 | HTTP method not supported for endpoint |

## Rate Limiting

- **Scrape Requests**: 1 pending request per user at a time
- **API Calls**: No global rate limit (handled by Firebase Functions)
- **Configuration Updates**: No limit, but logged for audit

## CORS

The API supports CORS for the following origins:
- Production frontend: `https://job-finder.web.app`
- Staging frontend: `https://job-finder-staging.web.app`
- Local development: `http://localhost:5173`

Supported methods: `GET`, `POST`, `PUT`, `DELETE`, `OPTIONS`

## Request ID

Every response includes a unique `requestId` field (UUID v4) for tracking and debugging. Include this ID when reporting issues.

## Timestamps

All timestamps are in ISO 8601 format (UTC):
```
2024-01-15T10:30:00.000Z
```

## Best Practices

### Authentication
```typescript
// Frontend example (React)
import { getAuth } from 'firebase/auth';

const auth = getAuth();
const token = await auth.currentUser?.getIdToken();

const response = await fetch('/submit-job', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ url, companyName })
});
```

### Error Handling
```typescript
const response = await fetch('/submit-job', { ... });
const data = await response.json();

if (!data.success) {
  console.error(`[${data.requestId}] ${data.error.code}: ${data.error.message}`);
  
  switch (data.error.code) {
    case 'UNAUTHENTICATED':
      // Redirect to login
      break;
    case 'VALIDATION_ERROR':
      // Show validation errors to user
      console.error(data.error.details);
      break;
    case 'RATE_LIMIT':
      // Show rate limit message
      break;
    default:
      // Generic error message
      alert('An error occurred. Please try again.');
  }
}
```

### Polling Queue Status
```typescript
async function pollQueueStatus(queueItemId: string): Promise<void> {
  const maxAttempts = 60; // 5 minutes (5s intervals)
  let attempts = 0;
  
  const interval = setInterval(async () => {
    attempts++;
    
    const response = await fetch(`/queue-status/${queueItemId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    const data = await response.json();
    
    if (data.success && data.data.status === 'success') {
      clearInterval(interval);
      console.log('Processing complete!');
    } else if (data.data.status === 'failed') {
      clearInterval(interval);
      console.error('Processing failed:', data.data.error_details);
    } else if (attempts >= maxAttempts) {
      clearInterval(interval);
      console.warn('Polling timeout - item still processing');
    }
  }, 5000);
}
```

## Examples

### Submit Job and Wait for Completion
```typescript
async function submitAndWait(url: string, companyName: string) {
  // 1. Submit job
  const submitResponse = await fetch('/submit-job', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ url, companyName })
  });
  
  const submitData = await submitResponse.json();
  if (!submitData.success) {
    throw new Error(submitData.error.message);
  }
  
  const queueItemId = submitData.data.id;
  console.log(`Submitted job ${queueItemId}`);
  
  // 2. Poll for completion
  await pollQueueStatus(queueItemId);
  
  // 3. Get final result
  const statusResponse = await fetch(`/queue-status/${queueItemId}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  const statusData = await statusResponse.json();
  return statusData.data;
}
```

### Bulk Submit Companies
```typescript
async function bulkSubmitCompanies(companies: Array<{name: string, url: string}>) {
  const results = await Promise.allSettled(
    companies.map(company => 
      fetch('/submit-company', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${editorToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          companyName: company.name,
          websiteUrl: company.url,
          source: 'manual_submission'
        })
      }).then(r => r.json())
    )
  );
  
  const successful = results.filter(r => r.status === 'fulfilled');
  const failed = results.filter(r => r.status === 'rejected');
  
  console.log(`Submitted ${successful.length}/${companies.length} companies`);
  return { successful, failed };
}
```

### Update Stop List
```typescript
async function addToStopList(
  type: 'company' | 'keyword' | 'domain',
  value: string
) {
  // 1. Get current stop list
  const getResponse = await fetch('/stop-list', {
    headers: { 'Authorization': `Bearer ${editorToken}` }
  });
  const currentList = await getResponse.json();
  
  // 2. Add new value
  let fieldName: string;
  if (type === 'company') fieldName = 'excludedCompanies';
  else if (type === 'keyword') fieldName = 'excludedKeywords';
  else fieldName = 'excludedDomains';
  
  const updated = {
    ...currentList.data,
    [fieldName]: [...currentList.data[fieldName], value]
  };
  
  // 3. Update
  const updateResponse = await fetch('/stop-list', {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${editorToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(updated)
  });
  
  return updateResponse.json();
}
```

## Testing

### Local Testing with Emulator
```bash
# Start Firebase Emulator
npm run serve

# Test health check
curl http://localhost:5001/project-id/us-central1/manageJobQueue/

# Test with authentication (requires Firebase Auth emulator)
curl -X POST http://localhost:5001/project-id/us-central1/manageJobQueue/submit-job \
  -H "Authorization: Bearer $LOCAL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://test.com/job", "companyName": "Test Co"}'
```

### Integration Testing
```typescript
// tests/integration/job-queue.test.ts
import { test, expect } from '@playwright/test';
import { getAuth } from 'firebase/auth';

test('submit job and check status', async ({ page }) => {
  // Login
  await page.goto('/login');
  await page.fill('#email', 'test@example.com');
  await page.fill('#password', 'password123');
  await page.click('#login-button');
  
  // Get token
  const auth = getAuth();
  const token = await auth.currentUser?.getIdToken();
  
  // Submit job via API
  const response = await page.request.post('/submit-job', {
    headers: { 'Authorization': `Bearer ${token}` },
    data: { url: 'https://test.com/job', companyName: 'Test' }
  });
  
  const data = await response.json();
  expect(data.success).toBe(true);
  expect(data.data.id).toBeTruthy();
  
  // Check status
  const statusResponse = await page.request.get(`/queue-status/${data.data.id}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  const statusData = await statusResponse.json();
  expect(statusData.success).toBe(true);
  expect(['pending', 'processing', 'success']).toContain(statusData.data.status);
});
```

## Support

For issues or questions:
1. Check the error `requestId` in the response
2. Review the [GitHub Issues](https://github.com/Jdubz/job-finder-BE/issues)
3. Contact: support@example.com

## Changelog

### v1.0.0 (2024-01-15)
- Initial release
- 15 API endpoints
- Job, company, and scrape queue submission
- Configuration management (stop list, AI settings, queue settings)
- Authentication with Firebase Auth
- Role-based access control (user/editor)
