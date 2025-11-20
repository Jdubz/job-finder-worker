# API Client Documentation

This document describes the API client layer for the Job Finder frontend application.

## Overview

All API clients are located in `src/api/` and provide a typed interface to backend services (Firebase Functions and Firestore).

## Base Client

### BaseClient

Location: `src/api/base-client.ts`

The foundation for all API clients, providing:

- Automatic retry logic with exponential backoff
- Request timeout handling
- Error normalization
- Type-safe request/response handling

**Key Methods:**

```typescript
protected async get<T>(endpoint: string, options?: RequestOptions): Promise<T>
protected async post<T>(endpoint: string, data: unknown, options?: RequestOptions): Promise<T>
protected async put<T>(endpoint: string, data: unknown, options?: RequestOptions): Promise<T>
protected async delete<T>(endpoint: string, options?: RequestOptions): Promise<T>
```

**Configuration:**

- Default timeout: 30 seconds
- Max retries: 3
- Backoff multiplier: 2x
- Retry on: Network errors, 5xx status codes

## API Clients

### PromptsClient

Location: `src/api/prompts-client.ts`

Manages AI prompt templates for document generation.

**Methods:**

#### `getPrompts(userId: string): Promise<PromptConfig>`

Retrieves all prompt templates for a user.

**Example:**

```typescript
const prompts = await promptsClient.getPrompts(user.uid)
console.log(prompts.resume_generation)
```

#### `updatePrompt(userId: string, type: PromptType, content: string): Promise<void>`

Updates a specific prompt template.

**Parameters:**

- `userId`: User ID
- `type`: One of `'resume_generation' | 'cover_letter_generation' | 'job_scraping' | 'job_matching'`
- `content`: New prompt content with {{variable}} placeholders

**Example:**

```typescript
await promptsClient.updatePrompt(
  user.uid,
  "resume_generation",
  "Generate a resume for {{job_title}} at {{company}}..."
)
```

#### `resetPrompts(userId: string): Promise<void>`

Resets all prompts to default values.

**Example:**

```typescript
await promptsClient.resetPrompts(user.uid)
```

**Utility Functions:**

- `extractVariables(prompt: string): string[]` - Extract {{variable}} placeholders
- `validatePrompt(prompt: string, requiredVars: string[]): boolean` - Validate prompt has required variables
- `DEFAULT_PROMPTS` - Default prompt templates constant

### ConfigClient

Location: `src/api/config-client.ts`

Manages job finder configuration (stop lists, queue settings, AI settings).

**Methods:**

#### `getStopList(userId: string): Promise<StopList>`

Retrieves user's stop list configuration.

**Returns:**

```typescript
interface StopList {
  companies: string[]
  keywords: string[]
  domains: string[]
}
```

#### `updateStopList(userId: string, stopList: StopList): Promise<void>`

Updates stop list configuration.

#### `getQueueSettings(userId: string): Promise<QueueSettings>`

Retrieves queue processing settings.

**Returns:**

```typescript
interface QueueSettings {
  max_concurrent_jobs: number
  retry_attempts: number
  retry_delay_seconds: number
  job_timeout_seconds: number
}
```

#### `updateQueueSettings(userId: string, settings: QueueSettings): Promise<void>`

Updates queue settings.

#### `getAISettings(userId: string): Promise<AISettings>`

Retrieves AI model configuration.

**Returns:**

```typescript
interface AISettings {
  model: string
  temperature: number
  max_tokens: number
  top_p: number
}
```

#### `updateAISettings(userId: string, settings: AISettings): Promise<void>`

Updates AI settings.

### GeneratorClient

Location: `src/api/generator-client.ts`

Handles document generation (resumes and cover letters) and retrieval.

**Methods:**

#### `generateResume(jobId: string): Promise<DocumentResponse>`

Generates a resume for a specific job match.

**Example:**

```typescript
const response = await generatorClient.generateResume("job-123")
console.log(response.documentId, response.downloadUrl)
```

#### `generateCoverLetter(jobId: string): Promise<DocumentResponse>`

Generates a cover letter for a specific job match.

#### `getDocumentHistory(userId: string, options?: DocumentHistoryOptions): Promise<DocumentHistoryItem[]>`

Retrieves user's document history.

**Options:**

```typescript
interface DocumentHistoryOptions {
  type?: "resume" | "cover_letter"
  limit?: number
  startAfter?: string // For pagination
}
```

#### `deleteDocument(documentId: string): Promise<void>`

Deletes a generated document.

#### `downloadDocument(documentId: string): Promise<Blob>`

Downloads a document as a Blob (PDF/DOCX).

#### `getUserDefaults(userId: string): Promise<UserDefaults>`

Retrieves user's default document generation settings.

**Returns:**

```typescript
interface UserDefaults {
  preferred_resume_style: string
  default_font: string
  default_font_size: number
  include_summary: boolean
  ai_settings_override?: Partial<AISettings>
}
```

#### `updateUserDefaults(userId: string, defaults: Partial<UserDefaults>): Promise<void>`

Updates user defaults.

### JobQueueClient

Location: `src/api/job-queue-client.ts`

Manages job processing queue operations.

**Methods:**

#### `submitJob(linkedInUrl: string): Promise<QueueItem>`

Submits a LinkedIn job URL for processing.

**Example:**

```typescript
const queueItem = await jobQueueClient.submitJob("https://www.linkedin.com/jobs/view/123456789")
console.log(queueItem.id, queueItem.status)
```

#### `getQueueItems(filters?: QueueFilters): Promise<QueueItem[]>`

Retrieves queue items with optional filtering.

**Filters:**

```typescript
interface QueueFilters {
  status?: "pending" | "processing" | "completed" | "failed" | "skipped"
  limit?: number
  startAfter?: string
}
```

#### `getQueueItem(itemId: string): Promise<QueueItem>`

Retrieves a specific queue item.

#### `cancelQueueItem(itemId: string): Promise<void>`

Cancels a pending or processing queue item.

#### `retryQueueItem(itemId: string): Promise<void>`

Retries a failed queue item.

#### `getQueueStats(): Promise<QueueStats>`

Retrieves overall queue statistics.

**Returns:**

```typescript
interface QueueStats {
  total: number
  pending: number
  processing: number
  completed: number
  failed: number
  skipped: number
}
```

### JobMatchesClient

Location: `src/api/job-matches-client.ts`

Manages job match results and filtering.

**Methods:**

#### `getJobMatches(filters?: JobMatchFilters): Promise<JobMatch[]>`

Retrieves job matches with optional filtering.

**Filters:**

```typescript
interface JobMatchFilters {
  min_score?: number
  max_score?: number
  status?: "new" | "viewed" | "applied" | "rejected"
  company?: string
  location?: string
  limit?: number
  startAfter?: string
}
```

#### `getJobMatch(matchId: string): Promise<JobMatch>`

Retrieves a specific job match with full details.

#### `updateMatchStatus(matchId: string, status: JobMatchStatus): Promise<void>`

Updates the status of a job match.

**Example:**

```typescript
await jobMatchesClient.updateMatchStatus("match-123", "applied")
```

#### `addNote(matchId: string, note: string): Promise<void>`

Adds a note to a job match.

#### `getNotes(matchId: string): Promise<JobNote[]>`

Retrieves all notes for a job match.

## Usage Examples

### Complete Job Submission Flow

```typescript
import { jobQueueClient, jobMatchesClient, generatorClient } from "@/api"

// 1. Submit job URL
const queueItem = await jobQueueClient.submitJob(linkedInUrl)

// 2. Monitor queue status (real-time via Firestore)
const unsubscribe = onSnapshot(doc(db, "queue_items", queueItem.id), (snapshot) => {
  const item = snapshot.data() as QueueItem
  if (item.status === "completed") {
    // Job processing complete
    loadJobMatches()
  }
})

// 3. Get job matches
const matches = await jobMatchesClient.getJobMatches({
  min_score: 70,
  limit: 10,
})

// 4. Generate resume for top match
const topMatch = matches[0]
const document = await generatorClient.generateResume(topMatch.id)

// 5. Download generated resume
const blob = await generatorClient.downloadDocument(document.documentId)
const url = URL.createObjectURL(blob)
window.open(url)
```

### Custom Prompt Management

```typescript
import { promptsClient } from "@/api"

// Get current prompts
const prompts = await promptsClient.getPrompts(userId)

// Extract variables from prompt
const variables = extractVariables(prompts.resume_generation)
console.log("Required variables:", variables)

// Update prompt
await promptsClient.updatePrompt(
  userId,
  "resume_generation",
  `Create a professional resume for {{job_title}} position.
   
   Candidate: {{candidate_name}}
   Company: {{company}}
   Location: {{location}}
   
   Highlight relevant experience and skills for this role.`
)

// Reset to defaults if needed
await promptsClient.resetPrompts(userId)
```

### Configuration Management

```typescript
import { configClient } from "@/api"

// Get all configuration
const [stopList, queueSettings, aiSettings] = await Promise.all([
  configClient.getStopList(userId),
  configClient.getQueueSettings(userId),
  configClient.getAISettings(userId),
])

// Update stop list
await configClient.updateStopList(userId, {
  companies: [...stopList.companies, "Bad Company Inc"],
  keywords: [...stopList.keywords, "unpaid", "intern"],
  domains: stopList.domains,
})

// Update AI settings
await configClient.updateAISettings(userId, {
  ...aiSettings,
  temperature: 0.7,
  max_tokens: 2000,
})
```

## Error Handling

All clients throw standardized errors:

```typescript
try {
  await promptsClient.updatePrompt(userId, "resume_generation", newPrompt)
} catch (error) {
  if (error instanceof ApiError) {
    console.error("API Error:", error.message)
    console.error("Status Code:", error.statusCode)
    console.error("Details:", error.details)
  }
}
```

## Type Safety

All clients use types from `@shared/types`:

- `QueueItem`, `QueueStats`, `QueueFilters`
- `JobMatch`, `JobMatchFilters`, `JobMatchStatus`
- `DocumentHistoryItem`, `UserDefaults`
- `StopList`, `QueueSettings`, `AISettings`
- `PromptConfig`, `PromptType`

## Testing

Mock clients are available for testing:

```typescript
import { createMockPromptsClient } from "@/api/__mocks__/prompts-client"

const mockClient = createMockPromptsClient({
  getPrompts: vi.fn().mockResolvedValue(DEFAULT_PROMPTS),
})
```

See `src/api/__tests__/` for test examples.
