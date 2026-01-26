# Claude CLI to Gemini API Migration Plan
## Job Listing Extraction in job-applicator

**Date:** 2026-01-26  
**Scope:** Replace Claude CLI with Gemini API for job listing extraction only  
**Strategy:** Hard cutover (no feature flags or backwards compatibility)

---

## Executive Summary

The job-applicator Electron app currently uses the Claude CLI for extracting job details from web pages. This plan outlines a complete migration to the Gemini API, leveraging the same API infrastructure already used in the job-finder-worker for job listing extraction and analysis.

### Current State
- **Claude CLI** is used for job extraction via `runCliForExtraction()` in `main.ts`
- UI has a provider selector (Claude/Gemini) but it's not functionally used - the code hardcodes Claude
- Job extraction happens when user clicks "Submit Job" button
- Extracted data is sent to backend `/api/queue/jobs` endpoint

### Target State
- **Gemini API** (via `google-genai` npm package) will replace Claude CLI
- Use same API key pattern as worker (`GEMINI_API_KEY` env var)
- Remove all Claude CLI dependencies and code paths
- Keep UI provider selector but update it to show active provider (Gemini only)

---

## System Analysis

### 1. Current Claude CLI Usage

**Location:** `job-applicator/src/main.ts`

```typescript
// Line 1248-1320: runCliCommon function
// Line 1322-1339: runCliForExtraction wrapper
// Line 930-976: submit-job IPC handler
```

**Flow:**
1. User clicks "Submit Job" → triggers `submit-job` IPC handler
2. Extract page content (10k chars max) from BrowserView
3. Build extraction prompt via `buildExtractionPrompt()` 
4. Call `runCliForExtraction(provider, prompt)`
5. Claude CLI spawned with args: `["--print", "--output-format", "json", "--dangerously-skip-permissions", "-p", "-"]`
6. Parse stdout JSON to `JobExtraction` type
7. Submit to backend API at `/api/queue/jobs`

**JobExtraction Interface:**
```typescript
{
  title: string | null
  description: string | null
  location: string | null
  techStack: string | null
  companyName: string | null
}
```

### 2. Worker's Gemini Implementation

**Location:** `job-finder-worker/src/job_finder/ai/providers.py`

The worker successfully uses Gemini API with:
- Package: `google-genai>=1.0.0`
- Auth: `GEMINI_API_KEY` or `GOOGLE_API_KEY` env var (or Vertex AI ADC fallback)
- Model: `gemini-2.0-flash` (default, configurable)
- Pattern: Simple prompt → `client.models.generate_content()` → parse response

**Key Code (Python):**
```python
from google import genai

client = genai.Client(api_key=api_key)
response = client.models.generate_content(
    model="gemini-2.0-flash",
    contents=prompt,
    config={
        "max_output_tokens": max_tokens,
        "temperature": temperature,
    },
)
return response.text
```

### 3. Dependencies to Add

**NPM Package:** `@google/generative-ai`
- Official Google Generative AI SDK for Node.js
- Provides same API as Python `google-genai` package
- Supports API key authentication (simpler than Vertex AI)

**Current job-applicator dependencies:**
```json
{
  "@shared/types": "*",
  "electron-store": "^11.0.2",
  "playwright-core": "^1.47.2"
}
```

**To add:**
```json
{
  "@google/generative-ai": "^0.21.0"
}
```

---

## Migration Plan

### Phase 1: Add Gemini API Support

#### 1.1 Install Dependencies
```bash
cd job-applicator
npm install @google/generative-ai
```

#### 1.2 Update Environment Configuration
Add to `job-applicator/.env`:
```bash
# Gemini API Key (same as worker)
GEMINI_API_KEY=your-api-key-here
GEMINI_DEFAULT_MODEL=gemini-2.0-flash-exp
```

#### 1.3 Create Gemini Provider Module

**New file:** `job-applicator/src/gemini-provider.ts`

```typescript
/**
 * Gemini API provider for job extraction.
 * Uses the same pattern as job-finder-worker for consistency.
 */

import { GoogleGenerativeAI } from '@google/generative-ai'
import { logger } from './logger.js'
import type { JobExtraction } from './types.js'
import { parseCliObjectOutput } from './utils.js'

export interface GeminiConfig {
  apiKey: string
  model?: string
  maxOutputTokens?: number
  temperature?: number
}

export class GeminiProvider {
  private client: GoogleGenerativeAI
  private model: string

  constructor(config: GeminiConfig) {
    if (!config.apiKey) {
      throw new Error('GEMINI_API_KEY is required')
    }

    this.client = new GoogleGenerativeAI(config.apiKey)
    this.model = config.model || process.env.GEMINI_DEFAULT_MODEL || 'gemini-2.0-flash-exp'
    
    logger.info(`[Gemini] Initialized with model: ${this.model}`)
  }

  async generateContent(
    prompt: string,
    options?: {
      maxOutputTokens?: number
      temperature?: number
    }
  ): Promise<string> {
    const maxOutputTokens = options?.maxOutputTokens || 1000
    const temperature = options?.temperature || 0.7

    try {
      const model = this.client.getGenerativeModel({
        model: this.model,
      })

      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens,
          temperature,
        },
      })

      const response = result.response
      const text = response.text()

      if (!text) {
        throw new Error('Gemini API returned empty response')
      }

      return text
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger.error(`[Gemini] API error: ${message}`)
      
      // Check for quota/rate limit errors
      if (message.toLowerCase().includes('quota') || 
          message.toLowerCase().includes('rate limit')) {
        throw new Error('Gemini API quota exceeded. Please try again later.')
      }
      
      throw new Error(`Gemini API error: ${message}`)
    }
  }

  async extractJobDetails(prompt: string): Promise<JobExtraction> {
    logger.info('[Gemini] Extracting job details...')
    
    const response = await this.generateContent(prompt, {
      maxOutputTokens: 2000,
      temperature: 0.3, // Lower temperature for more consistent JSON
    })

    logger.debug(`[Gemini] Raw response: ${response.slice(0, 500)}...`)

    try {
      // Use existing parser that handles markdown code blocks and extra text
      const jobData = parseCliObjectOutput(response)
      
      logger.info('[Gemini] Parsed job data successfully')
      
      return {
        title: (jobData.title as string) ?? null,
        description: (jobData.description as string) ?? null,
        location: (jobData.location as string) ?? null,
        techStack: (jobData.techStack as string) ?? null,
        companyName: (jobData.companyName as string) ?? null,
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error(`[Gemini] Failed to parse response: ${message}`)
      throw new Error(`Failed to parse Gemini response: ${message}`)
    }
  }
}

// Singleton instance
let geminiInstance: GeminiProvider | null = null

export function getGeminiProvider(): GeminiProvider {
  if (!geminiInstance) {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      throw new Error(
        'GEMINI_API_KEY environment variable is required. ' +
        'Add it to job-applicator/.env file.'
      )
    }
    geminiInstance = new GeminiProvider({ apiKey })
  }
  return geminiInstance
}
```

### Phase 2: Replace Claude CLI Code

#### 2.1 Update main.ts - Remove Claude CLI

**Changes to `job-applicator/src/main.ts`:**

1. **Remove imports (not needed):**
   - Keep `spawn` import for form-filling only (MCP server, not job extraction)

2. **Delete functions:**
   - Delete `runCliCommon()` (lines 1248-1320)
   - Delete `runCliForExtraction()` (lines 1322-1339)

3. **Update submit-job handler (lines 930-976):**

```typescript
// Import Gemini provider
import { getGeminiProvider } from './gemini-provider.js'

// Replace the submit-job handler
ipcMain.handle(
  "submit-job",
  async (_event: IpcMainInvokeEvent, _provider: CliProvider): Promise<{ success: boolean; message: string }> => {
    try {
      if (!browserView) throw new Error("BrowserView not initialized")

      // 1. Get current URL
      const url = browserView.webContents.getURL()
      if (!url || url === "about:blank") {
        return { success: false, message: "No page loaded - navigate to a job listing first" }
      }

      logger.info(`Extracting job details from: ${url}`)

      // 2. Extract page content (text only, limited to 10k chars)
      const pageContent: string = await browserView.webContents.executeJavaScript(`
        document.body.innerText.slice(0, 10000)
      `)

      if (!pageContent || pageContent.trim().length < 100) {
        return { success: false, message: "Page content too short - is this a job listing?" }
      }

      // 3. Use Gemini API to extract job details
      logger.info('Calling Gemini API for job extraction...')
      const gemini = getGeminiProvider()
      const extractPrompt = buildExtractionPrompt(pageContent, url)
      const extracted = await gemini.extractJobDetails(extractPrompt)
      logger.info("Extracted job details:", extracted)

      // 4. Submit to backend API using typed API client
      logger.info("Submitting job to queue...")
      const result = await submitJobToQueue({
        url,
        title: extracted.title,
        description: extracted.description,
        location: extracted.location,
        techStack: extracted.techStack,
        companyName: extracted.companyName,
      })

      return { success: true, message: `Job submitted (queue ID: ${result.id})` }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error("Submit job error:", message)
      return { success: false, message }
    }
  }
)
```

#### 2.2 Update Types

**File: `job-applicator/src/types.ts`**

The `CliProvider` type can be removed or kept for future extensibility:

**Option A - Remove completely:**
```typescript
// Delete lines 133-134:
// export type CliProvider = "claude" | "gemini"
```

**Option B - Keep for documentation (recommended):**
```typescript
// Update to document the migration
/** Provider type (legacy - only Gemini is used for job extraction) */
export type CliProvider = "gemini"
```

#### 2.3 Update UI

**File: `job-applicator/src/renderer/index.html`**

Update the agent provider selector (lines 153-156):

```html
<select id="agentProviderSelect" class="provider-select" disabled>
  <option value="gemini">Gemini (Active)</option>
</select>
```

Add explanatory text:
```html
<p class="provider-note">Job extraction uses Gemini API</p>
```

**File: `job-applicator/src/renderer/app.ts`**

Update submitJob function (around line 1731):

```typescript
async function submitJob() {
  // Provider parameter kept for API compatibility but hardcoded to gemini
  const provider = "gemini" as const

  try {
    setButtonsEnabled(false)
    setStatus("Extracting job details...")

    const result = await window.api.submitJob(provider)
    // ... rest of function unchanged
  }
}
```

### Phase 3: Update Dependencies & Configuration

#### 3.1 Update package.json

**File: `job-applicator/package.json`**

Add dependency:
```json
{
  "dependencies": {
    "@shared/types": "*",
    "electron-store": "^11.0.2",
    "playwright-core": "^1.47.2",
    "@google/generative-ai": "^0.21.0"
  }
}
```

#### 3.2 Update .env.example

**File: `job-applicator/.env.example`**

Add:
```bash
# Gemini API Configuration
GEMINI_API_KEY=your-api-key-here
GEMINI_DEFAULT_MODEL=gemini-2.0-flash-exp
```

#### 3.3 Update README

**File: `job-applicator/README.md`**

Update setup instructions:

```markdown
## Prerequisites

1. **Gemini API Key**: Get one from [Google AI Studio](https://makersuite.google.com/app/apikey)
2. **Node.js**: Version 18 or higher
3. **Backend API**: Running job-finder backend

## Setup

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Add your Gemini API key to `.env`:
   ```bash
   GEMINI_API_KEY=your-api-key-here
   ```

3. Install dependencies:
   ```bash
   npm install
   ```
```

Remove any references to Claude CLI installation.

### Phase 4: Testing & Validation

#### 4.1 Unit Tests

**File: `job-applicator/src/gemini-provider.test.ts`** (new)

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GeminiProvider } from './gemini-provider.js'

describe('GeminiProvider', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('should throw error if no API key provided', () => {
    expect(() => new GeminiProvider({ apiKey: '' })).toThrow('GEMINI_API_KEY is required')
  })

  it('should use default model if not specified', () => {
    const provider = new GeminiProvider({ apiKey: 'test-key' })
    expect(provider['model']).toBe('gemini-2.0-flash-exp')
  })

  it('should parse job extraction response', async () => {
    // Mock the GoogleGenerativeAI client
    const mockResponse = {
      response: {
        text: () => JSON.stringify({
          title: 'Software Engineer',
          description: 'Build cool stuff',
          location: 'Remote',
          techStack: 'TypeScript, React',
          companyName: 'Acme Corp'
        })
      }
    }

    const provider = new GeminiProvider({ apiKey: 'test-key' })
    // Add mocking logic for actual test
  })
})
```

#### 4.2 Integration Tests

**Test Scenarios:**

1. **Happy Path:** Submit job from real job listing page
   - Navigate to job listing (e.g., LinkedIn, Indeed)
   - Click "Submit Job"
   - Verify extraction succeeds
   - Check backend queue for job

2. **Error Handling:**
   - Missing API key → Should show clear error message
   - Invalid page content → Should reject gracefully
   - API quota exceeded → Should show user-friendly message
   - Network timeout → Should retry with backoff

3. **Edge Cases:**
   - Very short page content (< 100 chars)
   - Non-job listing pages
   - Pages with non-standard formatting
   - Special characters in job data

#### 4.3 Comparison Testing

Before removing Claude CLI, run parallel tests:

**Test Script: `scripts/compare-extraction.js`**

```javascript
// Compare Claude vs Gemini extraction results
// Run on same job listings to verify quality
```

Expected metrics:
- **Accuracy:** Both should extract correct fields
- **Speed:** Gemini should be faster (no CLI spawn overhead)
- **Reliability:** Both should handle edge cases

---

## Rollout Plan

### Stage 1: Development & Testing (Days 1-2)
- [ ] Add `@google/generative-ai` dependency
- [ ] Create `gemini-provider.ts` module
- [ ] Write unit tests for GeminiProvider
- [ ] Update `.env.example` with Gemini config
- [ ] Test locally with real job listings

### Stage 2: Code Migration (Day 3)
- [ ] Update `submit-job` handler to use Gemini
- [ ] Remove `runCliCommon` and `runCliForExtraction`
- [ ] Update UI to show Gemini as active provider
- [ ] Update types (CliProvider)
- [ ] Run integration tests

### Stage 3: Documentation (Day 3)
- [ ] Update README with Gemini setup instructions
- [ ] Remove Claude CLI references from docs
- [ ] Update CONTRIBUTING.md if needed
- [ ] Add migration notes to CHANGELOG

### Stage 4: Deployment (Day 4)
- [ ] Commit changes to feature branch
- [ ] Create PR with migration details
- [ ] Review and merge
- [ ] Deploy to production
- [ ] Monitor for errors

---

## Risk Assessment

### High Risk
- **API Key Security:** Gemini API key must be kept secret
  - Mitigation: Use `.env` file, add to `.gitignore`
  - Add validation to prevent accidental commits

### Medium Risk
- **API Quota Limits:** Gemini free tier has daily limits
  - Mitigation: Implement rate limiting, show clear error messages
  - Monitor usage in Google AI Studio

- **Response Format Changes:** Gemini might format JSON differently than Claude
  - Mitigation: Use robust parser (`parseCliObjectOutput`) that handles variations
  - Add fallback parsing logic

### Low Risk
- **Performance Regression:** API calls might be slower than local CLI
  - Mitigation: Gemini is typically faster due to no CLI spawn overhead
  - Monitor actual timings in production

---

## Backward Compatibility

**None required** - This is a hard cutover as specified.

However, we should:
1. Keep the MCP server and form-filling logic (still uses Claude CLI)
2. Archive Claude CLI extraction code in git history
3. Document the change in CHANGELOG

---

## Success Criteria

### Functional Requirements
- ✅ Job extraction works for major job sites (LinkedIn, Indeed, Greenhouse, etc.)
- ✅ Extracted data matches Claude CLI quality (95%+ accuracy)
- ✅ Error messages are user-friendly
- ✅ No Claude CLI dependencies remain in job extraction flow

### Performance Requirements
- ✅ Job extraction completes in < 10 seconds (vs Claude ~5-15s)
- ✅ API calls have < 5% failure rate
- ✅ No memory leaks from Gemini client

### Code Quality
- ✅ Unit test coverage > 80% for new Gemini module
- ✅ TypeScript types are correct and complete
- ✅ ESLint passes with no errors
- ✅ Documentation is up to date

---

## Future Considerations

### Phase 2: Form Filling Migration (Out of Scope)
The form-filling feature still uses Claude CLI via MCP server. This could be migrated later to:
- Gemini API with custom tool calling
- Direct Playwright automation (no AI)
- Alternative AI providers

### API Key Rotation
Consider implementing:
- Support for multiple API keys (round-robin)
- Automatic key rotation
- Key health checks

### Monitoring & Analytics
Add telemetry for:
- Extraction success/failure rates
- Response times
- API costs
- User satisfaction (thumbs up/down on extractions)

---

## Appendices

### A. File Changes Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `package.json` | Modify | Add `@google/generative-ai` dependency |
| `.env.example` | Modify | Add `GEMINI_API_KEY` config |
| `src/gemini-provider.ts` | Create | New Gemini API wrapper |
| `src/main.ts` | Modify | Replace Claude CLI with Gemini API |
| `src/types.ts` | Modify | Update/remove `CliProvider` type |
| `src/renderer/index.html` | Modify | Update provider selector UI |
| `src/renderer/app.ts` | Modify | Update submitJob function |
| `README.md` | Modify | Update setup instructions |
| `src/gemini-provider.test.ts` | Create | Unit tests for Gemini provider |

### B. Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GEMINI_API_KEY` | Yes | - | Google Gemini API key from AI Studio |
| `GEMINI_DEFAULT_MODEL` | No | `gemini-2.0-flash-exp` | Model to use for extraction |

### C. API Comparison

| Feature | Claude CLI | Gemini API |
|---------|------------|------------|
| Authentication | CLI config | API key |
| Latency | 5-15s | 2-8s |
| Cost | Free (beta) | Free tier + paid |
| Rate Limits | Unknown | 15 RPM (free), higher (paid) |
| JSON Output | Native | Requires prompt engineering |
| Error Handling | Exit codes | Exceptions |
| Offline Support | No | No |

---

## Questions & Answers

**Q: Can we use the same Gemini API key as the worker?**  
A: Yes! Both use `GEMINI_API_KEY` environment variable. Just copy the value to `job-applicator/.env`.

**Q: What happens if Gemini API is down?**  
A: The extraction will fail with a clear error message. User can retry later. We could add retry logic with exponential backoff.

**Q: Will this break existing deployments?**  
A: Yes, this is a hard cutover. After deployment, Claude CLI is no longer used for job extraction. Ensure `GEMINI_API_KEY` is set before deploying.

**Q: How do we handle API costs?**  
A: Gemini has a generous free tier (15 RPM, 1500 RPD). For production, monitor usage in Google AI Studio and upgrade to paid tier if needed. Each extraction uses ~1k-2k tokens (~$0.001 per job).

**Q: What about form filling - does that still use Claude?**  
A: Yes, form filling via MCP server still uses Claude CLI. That's out of scope for this migration. The only change is job extraction.

---

## Implementation Checklist

- [ ] Read and approve plan
- [ ] Create feature branch: `feature/migrate-claude-to-gemini-extraction`
- [ ] Install dependencies
- [ ] Create Gemini provider module
- [ ] Write unit tests
- [ ] Update main.ts
- [ ] Update UI components
- [ ] Update documentation
- [ ] Test locally with real job listings
- [ ] Create PR
- [ ] Code review
- [ ] Merge to main
- [ ] Deploy
- [ ] Monitor for 48 hours
- [ ] Archive plan

---

**Plan Status:** Draft  
**Next Review:** After initial implementation  
**Contact:** Development team
