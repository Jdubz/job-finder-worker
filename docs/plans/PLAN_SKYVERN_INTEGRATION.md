# Skyvern Integration Plan

> Status: Draft
> Owner: @Jdubz
> Last Updated: 2025-12-12

## Overview

Hard cutover from custom Claude CLI agent to self-hosted Skyvern for browser automation.

**Goal**: MVP form filling automation using Skyvern's computer vision + LLM approach.

**Scope**: Remove all legacy agent code. No feature flags. No backwards compatibility.

---

## Architecture Comparison

### Before (Legacy)

```
┌─────────────────────────────────────────────────────────────┐
│                    Electron App                             │
├─────────────────────────────────────────────────────────────┤
│  Renderer          │  Main Process                          │
│  ─────────         │  ────────────                          │
│  Agent UI Panel    │  AgentSession (Claude CLI spawn)       │
│  ↓ IPC             │  ↓                                     │
│  Start/Stop/Fill   │  Stream-JSON parsing                   │
│                    │  ↓                                     │
│                    │  AgentTools (CDP execution)            │
│                    │  ↓                                     │
│                    │  BrowserView                           │
└─────────────────────────────────────────────────────────────┘
```

### After (Skyvern)

```
┌─────────────────────────────────────────────────────────────┐
│                    Electron App                             │
├─────────────────────────────────────────────────────────────┤
│  Renderer          │  Main Process                          │
│  ─────────         │  ────────────                          │
│  Task Status UI    │  SkyvernClient (API calls)             │
│  ↓ IPC             │  ↓                                     │
│  Fill Form         │  POST /tasks → Poll status             │
│                    │                                        │
│  BrowserView       │  (Display only - no automation)        │
│  (watch progress)  │                                        │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                 Skyvern (Docker)                            │
├─────────────────────────────────────────────────────────────┤
│  API Server (:8000)  │  Browser Worker (Playwright)         │
│  ────────────────    │  ─────────────────────────           │
│  POST /tasks         │  Computer Vision                     │
│  GET /tasks/:id      │  LLM Reasoning (Claude API)          │
│  Workflow Engine     │  Form Filling                        │
│                      │  Screenshot Capture                  │
│  PostgreSQL          │  CAPTCHA Detection                   │
└─────────────────────────────────────────────────────────────┘
```

---

## Files to DELETE (Complete Removal)

| File | Lines | Reason |
|------|-------|--------|
| `src/agent-session.ts` | 447 | Replaced by Skyvern API |
| `src/agent-tools.ts` | 657 | Skyvern handles all tools |
| `src/cli-config.ts` | 43 | No CLI spawning needed |

**Total: 1,147 lines removed**

---

## Files to MODIFY

### 1. `src/main.ts`

**Remove:**
- Lines 69-70: Agent imports
- Lines 848-1012: All agent IPC handlers (5 handlers)
  - `agent-start-session`
  - `agent-stop-session`
  - `agent-send-command`
  - `agent-fill-form`
  - `agent-get-status`

**Add:**
- Import `SkyvernClient` (new file)
- New IPC handlers:
  - `skyvern-fill-form` - Start Skyvern task
  - `skyvern-get-status` - Poll task status
  - `skyvern-cancel` - Cancel running task

**Keep:**
- BrowserView creation (for user to watch)
- Navigation handlers
- Document generation handlers
- Job extraction handlers

### 2. `src/preload.ts`

**Remove:**
- Lines 14-37: All agent-* API methods
  - `agentStartSession`
  - `agentStopSession`
  - `agentSendCommand`
  - `agentFillForm`
  - `agentGetStatus`
  - `onAgentOutput`
  - `onAgentStatus`
  - `onAgentToolCall`

**Add:**
- `skyvernFillForm(options)` - Start form fill task
- `skyvernGetStatus()` - Get current task status
- `skyvernCancel()` - Cancel task
- `onSkyvernStatus(callback)` - Task status updates

### 3. `src/renderer/index.html`

**Remove:**
- Lines 110-142: Entire Agent Session Panel
  - Provider select
  - Start/Stop buttons
  - Agent command input
  - Agent output display

**Add:**
- Simple task status panel:
  ```html
  <section class="sidebar-section" id="skyvernSection">
    <div class="section-header">
      <h3>Form Automation</h3>
      <span id="skyvernStatus">Ready</span>
    </div>
    <button id="fillFormBtn">Fill Form</button>
    <div id="skyvernProgress"></div>
  </section>
  ```

### 4. `src/renderer/app.ts`

**Remove:**
- Lines 131-149: Agent DOM element references
- Lines 711-891: All agent session functions
  - `startAgentSession()`
  - `stopAgentSession()`
  - `sendAgentCommand()`
  - `fillFormWithAgent()`
  - `appendAgentOutput()`
  - `updateAgentStatusUI()`
  - `cleanupAgentListeners()`
- Agent event listener setup/cleanup

**Add:**
- `fillFormWithSkyvern()` - Call Skyvern API
- `pollSkyvernStatus()` - Poll until complete
- `updateSkyvernUI()` - Update progress display
- Simplified status tracking

### 5. `src/types.ts`

**Remove:**
- `AgentSessionState` type
- `AgentOutputData` interface
- `AgentStatusData` interface
- `CliProvider` type

**Add:**
- `SkyvernTaskStatus` type
- `SkyvernTaskResult` interface

---

## New Files to CREATE

### 1. `src/skyvern-client.ts`

```typescript
/**
 * Skyvern API Client
 *
 * Communicates with self-hosted Skyvern instance for browser automation.
 */

import { logger } from "./logger.js"

export interface SkyvernTask {
  task_id: string
  status: "created" | "running" | "completed" | "failed" | "terminated"
  url: string
  created_at: string
  completed_at?: string
  failure_reason?: string
  extracted_information?: Record<string, unknown>
  screenshots?: string[]
}

export interface SkyvernTaskRequest {
  url: string
  navigation_goal: string
  navigation_payload?: Record<string, unknown>
  data_extraction_goal?: string
  error_code_mapping?: Record<string, string>
}

export class SkyvernClient {
  private baseUrl: string
  private apiKey: string

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "")
    this.apiKey = apiKey
  }

  /**
   * Create and run a new task
   */
  async createTask(request: SkyvernTaskRequest): Promise<SkyvernTask> {
    const response = await fetch(`${this.baseUrl}/api/v1/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
      },
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Skyvern API error: ${response.status} - ${error}`)
    }

    return response.json()
  }

  /**
   * Get task status
   */
  async getTask(taskId: string): Promise<SkyvernTask> {
    const response = await fetch(`${this.baseUrl}/api/v1/tasks/${taskId}`, {
      headers: {
        "x-api-key": this.apiKey,
      },
    })

    if (!response.ok) {
      throw new Error(`Skyvern API error: ${response.status}`)
    }

    return response.json()
  }

  /**
   * Cancel a running task
   */
  async cancelTask(taskId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/v1/tasks/${taskId}`, {
      method: "DELETE",
      headers: {
        "x-api-key": this.apiKey,
      },
    })

    if (!response.ok) {
      throw new Error(`Skyvern API error: ${response.status}`)
    }
  }

  /**
   * Poll task until completion
   */
  async waitForTask(
    taskId: string,
    onProgress?: (task: SkyvernTask) => void,
    pollInterval = 2000,
    timeout = 300000
  ): Promise<SkyvernTask> {
    const startTime = Date.now()

    while (Date.now() - startTime < timeout) {
      const task = await this.getTask(taskId)

      if (onProgress) {
        onProgress(task)
      }

      if (task.status === "completed" || task.status === "failed" || task.status === "terminated") {
        return task
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval))
    }

    throw new Error("Task timeout")
  }
}

// Singleton instance
let client: SkyvernClient | null = null

export function getSkyvernClient(): SkyvernClient {
  if (!client) {
    const baseUrl = process.env.SKYVERN_BASE_URL || "http://localhost:8000"
    const apiKey = process.env.SKYVERN_API_KEY || ""
    client = new SkyvernClient(baseUrl, apiKey)
  }
  return client
}
```

### 2. `docker-compose.skyvern.yml`

```yaml
version: "3.8"

# SECURITY NOTE: Pin to a specific version/digest before production use.
# Using :latest is a supply-chain risk - a compromised image could exfiltrate secrets.
# Check https://github.com/Skyvern-AI/skyvern/releases for stable versions
# or use a specific SHA digest: image: public.ecr.aws/skyvern/skyvern@sha256:...

services:
  skyvern:
    # TODO: Pin to a specific version before production deployment
    image: public.ecr.aws/skyvern/skyvern:latest
    ports:
      - "8000:8000"
    environment:
      - DATABASE_STRING=postgresql+psycopg://skyvern:skyvern@postgres:5432/skyvern
      - BROWSER_TYPE=chromium-headful
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - LLM_KEY=ANTHROPIC
    depends_on:
      - postgres
    volumes:
      - skyvern-data:/data

  postgres:
    image: postgres:15
    environment:
      - POSTGRES_USER=skyvern
      - POSTGRES_PASSWORD=skyvern
      - POSTGRES_DB=skyvern
    volumes:
      - postgres-data:/var/lib/postgresql/data

volumes:
  skyvern-data:
  postgres-data:
```

---

## Implementation Steps

### Phase 1: Setup Skyvern Infrastructure

1. Create `docker-compose.skyvern.yml`
2. Add environment variables to `.env`:
   ```
   SKYVERN_BASE_URL=http://localhost:8000
   SKYVERN_API_KEY=local-dev-key
   ANTHROPIC_API_KEY=sk-ant-...
   ```
3. Test Skyvern standalone: `docker-compose -f docker-compose.skyvern.yml up`
4. Verify API: `curl http://localhost:8000/api/v1/health`

### Phase 2: Create Skyvern Client

1. Create `src/skyvern-client.ts`
2. Implement `createTask()`, `getTask()`, `cancelTask()`, `waitForTask()`
3. Add proper error handling and logging

### Phase 3: Remove Legacy Agent Code

1. Delete files:
   - `src/agent-session.ts`
   - `src/agent-tools.ts`
   - `src/cli-config.ts`

2. Remove from `src/main.ts`:
   - Agent imports
   - Agent IPC handlers
   - Agent event listeners

3. Remove from `src/preload.ts`:
   - All agent-* API methods

4. Remove from `src/renderer/app.ts`:
   - Agent DOM references
   - Agent functions
   - Agent event listeners

5. Remove from `src/renderer/index.html`:
   - Agent Session Panel

6. Remove from `src/types.ts`:
   - Agent types

### Phase 4: Implement Skyvern Integration

1. Add to `src/main.ts`:
   ```typescript
   import { getSkyvernClient } from "./skyvern-client.js"

   ipcMain.handle("skyvern-fill-form", async (_event, options) => {
     const { url, profileText, jobContext } = options
     const client = getSkyvernClient()

     const task = await client.createTask({
       url,
       navigation_goal: `Fill out this job application form using the following profile information:\n\n${profileText}\n\nJob context:\n${jobContext}\n\nFill all required fields. Upload resume if there's a file upload. Do NOT click submit.`,
     })

     return { success: true, taskId: task.task_id }
   })

   ipcMain.handle("skyvern-get-status", async (_event, taskId) => {
     const client = getSkyvernClient()
     const task = await client.getTask(taskId)
     return task
   })

   ipcMain.handle("skyvern-cancel", async (_event, taskId) => {
     const client = getSkyvernClient()
     await client.cancelTask(taskId)
     return { success: true }
   })
   ```

2. Add to `src/preload.ts`:
   ```typescript
   skyvernFillForm: (options: { url: string; profileText: string; jobContext: string }) =>
     ipcRenderer.invoke("skyvern-fill-form", options),
   skyvernGetStatus: (taskId: string) =>
     ipcRenderer.invoke("skyvern-get-status", taskId),
   skyvernCancel: (taskId: string) =>
     ipcRenderer.invoke("skyvern-cancel", taskId),
   ```

3. Update `src/renderer/app.ts`:
   ```typescript
   async function fillFormWithSkyvern() {
     if (!selectedJobMatchId) return

     const match = jobMatches.find(m => m.id === selectedJobMatchId)
     if (!match) return

     setStatus("Starting form automation...", "loading")
     fillFormBtn.disabled = true

     try {
       const profile = await api.getProfile()
       const result = await api.skyvernFillForm({
         url: match.listing.url,
         profileText: profile.text,
         jobContext: `${match.listing.title} at ${match.listing.companyName}`,
       })

       if (result.success) {
         pollSkyvernStatus(result.taskId)
       }
     } catch (err) {
       setStatus("Form automation failed", "error")
       fillFormBtn.disabled = false
     }
   }

   async function pollSkyvernStatus(taskId: string) {
     const task = await api.skyvernGetStatus(taskId)

     updateSkyvernUI(task)

     if (task.status === "running" || task.status === "created") {
       setTimeout(() => pollSkyvernStatus(taskId), 2000)
     } else if (task.status === "completed") {
       setStatus("Form filled successfully!", "success")
       fillFormBtn.disabled = false
     } else {
       setStatus(`Form automation failed: ${task.failure_reason}`, "error")
       fillFormBtn.disabled = false
     }
   }
   ```

### Phase 5: Update UI

1. Simplify `src/renderer/index.html`:
   - Remove agent panel
   - Add simple "Fill Form" button with status

2. Update styles if needed

### Phase 6: Testing

1. Start Skyvern: `docker-compose -f docker-compose.skyvern.yml up -d`
2. Start app: `npm run dev`
3. Test flow:
   - Select job
   - Click "Fill Form"
   - Watch Skyvern fill the form
   - Verify completion status

---

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SKYVERN_BASE_URL` | `http://localhost:8000` | Skyvern API endpoint |
| `SKYVERN_API_KEY` | (empty) | API key for auth |
| `ANTHROPIC_API_KEY` | (required) | Claude API for Skyvern |

### Skyvern Task Parameters

```typescript
{
  url: "https://jobs.example.com/apply",
  navigation_goal: "Fill out the job application form...",
  navigation_payload: {
    // Optional: Pre-structured data
    first_name: "John",
    email: "john@example.com"
  },
  error_code_mapping: {
    // Optional: Custom error detection
    "already_applied": "You have already applied"
  }
}
```

---

## BrowserView Strategy

### Option A: Remove BrowserView (Simpler)

- Skyvern runs its own browser
- User doesn't see automation happening
- Simpler architecture

### Option B: Keep BrowserView (Better UX) - RECOMMENDED

- Keep BrowserView for user to watch
- Navigate to job URL in BrowserView
- Skyvern automates in its own browser
- User sees "before" state, gets "completed" notification

### Option C: VNC Streaming (Advanced)

- Skyvern supports VNC streaming
- Could embed VNC viewer in Electron
- User watches automation in real-time
- More complex setup

**Recommendation: Option B for MVP**

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Skyvern Docker resource usage | Set memory limits, run on capable machine |
| API key exposure | Use environment variables, never commit |
| Task timeout | Set reasonable timeout (5 min), allow cancel |
| Form fill failures | Log errors, allow retry |
| Network issues | Health check before starting task |

---

## Success Criteria

- [ ] Legacy agent code completely removed
- [ ] Skyvern Docker runs locally
- [ ] Can start form fill task via API
- [ ] Task status polling works
- [ ] Form filled successfully on test job site
- [ ] Error handling for failures
- [ ] Build passes with no legacy imports

---

## Estimated Effort

| Phase | Description | Files Changed |
|-------|-------------|---------------|
| 1 | Skyvern infrastructure | 2 new files |
| 2 | Skyvern client | 1 new file |
| 3 | Remove legacy code | 7 files modified, 3 deleted |
| 4 | Skyvern integration | 3 files modified |
| 5 | UI updates | 2 files modified |
| 6 | Testing | - |

**Total: ~1,200 lines removed, ~300 lines added**
