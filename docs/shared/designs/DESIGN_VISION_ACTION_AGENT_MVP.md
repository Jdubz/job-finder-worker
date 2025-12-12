> Status: Active
> Owner: @jdubz
> Last Updated: 2025-12-12

# Vision/Action Agent MVP for Job Applicator

## Purpose
Replace brittle selector-based form filling in the Electron applicator with a minimal vision-driven loop that issues pixel-level actions via CDP. Goal is to reliably complete job application forms using only local CLI models (no external APIs) and a single screenshot in memory at any time.

## Scope
- **In scope:** One-step-at-a-time vision/action loop in `src/main.ts`, new IPC entry point (`agent-fill`), renderer log updates, small schema for actions.
- **Out of scope:** Feature flags, legacy selector fill path, MCP servers, multiple screenshots/history storage, remote API calls.

## Action Schema (CLI output)
```json
{
  "action": {
    "kind": "click" | "double_click" | "type" | "scroll" | "keypress" | "wait" | "done",
    "x": 0, "y": 0,          // required for click/double_click
    "text": "string",        // for type
    "dy": 400,                // for scroll (vertical, default 0 if omitted)
    "dx": 0,                  // optional horizontal scroll (default 0); at least one of dx/dy must be non-zero for scroll
    "key": "Tab" | "Enter" | "Escape" | "Backspace" | "SelectAll", // for keypress
    "ms": 800,                // for wait
    "reason": "why done"     // for done
  }
}
```

## Loop (max 40 steps per fill, configurable)
1. Capture single screenshot of BrowserView at ~1280px wide, JPEG quality ~60; compute a fast hash (e.g., sha1) for “no visual change” detection; discard previous image bytes after hashing.
2. Gather context: goal text, current URL, last 3 actions/outcomes, hash of previous screenshot.
3. Send context + screenshot to the local CLI provider (claude/codex/gemini wrapper) expecting the JSON schema above. If JSON parse fails, retry once with a hard stop.
4. Execute the returned action via CDP:
   - click/double_click → `Input.dispatchMouseEvent`
   - type → only proceed if `document.activeElement` is an input/textarea/contenteditable; otherwise fail the action so the model must click first, then `Input.insertText`
   - scroll → `window.scrollBy(dx, dy)`
   - keypress → `Input.dispatchKeyEvent`
   - wait → `setTimeout`
5. Stop when action is `done`, when two consecutive hashes match (stuck), or when step cap reached.
6. Stream concise progress events to renderer (step number, action kind, result) for user visibility.

**Configurability:** expose `AGENT_MAX_STEPS` in app config (env or simple JSON settings) with a default of 40; the loop reads this value once at start so operators can tune without code changes.
Optionally expose `AGENT_STUCK_HASH_THRESHOLD` (default 3) to tune “no progress” detection.

## Prompts (per step, minimal)
```
You automate a job application form.
Goal: <goal text>
URL: <url>
Recent actions: <last 3 actions, with outcomes>
Previous screenshot hash: <hash>
Screenshot (base64 JPEG): <data:image/jpeg;base64,...>

Return exactly one JSON object matching the schema. Prefer click → type → Tab/Enter to submit. Use done when the form is submitted or you are blocked.
```

## Failure / Safety Rules
- Reject/ignore actions whose coordinates are outside the visible viewport bounds.
- If focused element is not form-capable, the `type` action should fail so the model issues a click first (no implicit Tab/click side effects).
- Per-loop timeout: 45s; per-action timeout: 3s. Abort with an error message on timeout.
- Detect “no progress” when three consecutive screenshot hashes match after an action; **do not run this check for pure wait actions**; treat N=3 consecutive non-wait no-change events as “stuck” and abort with a clear message. (Threshold configurable via `AGENT_STUCK_HASH_THRESHOLD`.)

## Telemetry (lightweight)
- Log per-step: action, result (`ok`/`blocked`), screenshot byte size, hash.
- Emit final summary: steps used, stop reason (done/limit/stuck/error), elapsed ms.

## Tasks to implement (actionable)
1) Add `capturePage` + hash helper in `src/main.ts` (single screenshot lifecycle).
2) Add `runVisionAgent(goal, provider)` loop implementing the steps above and CDP action executors.
3) Replace existing fill IPC with `agent-fill` that calls the loop and streams progress to renderer.
4) Update renderer `fill` button handler to invoke `agent-fill` and display streamed log/results (no legacy filler path).
5) Wire CLI prompt template and JSON parsing with one retry on parse failure; enforce `AGENT_MAX_STEPS` (default 40) cap and timeouts.
6) Add minimal tests: unit test for action schema parser and hash-based "no change" detection; integration happy-path behind `vitest --runInBand` using a fixture page.

---

## Implementation Plan

### Hard Cutover Strategy
This is a complete replacement - no feature flags, no legacy code paths. The selector-based form filling is removed entirely.

### Files to Modify

#### `job-applicator/src/types.ts`
Add new types for the vision agent:

```typescript
// Action schema from CLI
export type AgentActionKind = "click" | "double_click" | "type" | "scroll" | "keypress" | "wait" | "done"

export interface AgentAction {
  kind: AgentActionKind
  x?: number           // click/double_click
  y?: number           // click/double_click
  text?: string        // type
  dx?: number          // scroll (default 0)
  dy?: number          // scroll (default 0)
  key?: "Tab" | "Enter" | "Escape" | "Backspace" | "SelectAll"  // keypress
  ms?: number          // wait
  reason?: string      // done
}

export interface AgentActionResult {
  step: number
  action: AgentAction
  result: "ok" | "blocked" | "error"
  error?: string
}

export interface AgentProgress {
  phase: "starting" | "running" | "completed" | "failed"
  step: number
  totalSteps: number
  currentAction?: AgentAction
  lastResult?: "ok" | "blocked" | "error"
  message: string
  screenshotHash?: string
}

export interface AgentSummary {
  stepsUsed: number
  stopReason: "done" | "limit" | "stuck" | "error"
  elapsedMs: number
  finalReason?: string  // from done action or error message
}
```

Remove legacy types (no longer needed after cutover):
- `FormField`
- `SelectOption`
- `FillInstruction`
- `EnhancedFillInstruction`
- `FormFillSummary`
- `FormFillProgress`

#### `job-applicator/src/main.ts`

**Delete these functions/code blocks:**
- `EXTRACT_FORM_SCRIPT` constant (lines 102-133)
- `fillFormField()` function (lines 337-478)
- `fill-form` IPC handler (lines 897-1156)
- `runEnhancedCli()` function (lines 1238-1257)
- `runStreamingCli()` function (lines 1289-1444)
- `sendFormFillProgress()` helper (lines 1449-1453)

**Add these new functions:**

```typescript
// Configuration
const AGENT_MAX_STEPS = parseInt(process.env.AGENT_MAX_STEPS || "40", 10)
const AGENT_STUCK_HASH_THRESHOLD = parseInt(process.env.AGENT_STUCK_HASH_THRESHOLD || "3", 10)
const AGENT_LOOP_TIMEOUT_MS = 45000  // 45s per step
const AGENT_ACTION_TIMEOUT_MS = 3000 // 3s per action

// Screenshot capture + hash
async function capturePage(): Promise<{ screenshot: Buffer; hash: string }> {
  if (!browserView) throw new Error("BrowserView not initialized")

  // Capture at ~1280px wide, JPEG quality 60
  const screenshot = await browserView.webContents.capturePage()
  const jpeg = screenshot.toJPEG(60)

  // Compute SHA1 hash for change detection
  const crypto = await import("crypto")
  const hash = crypto.createHash("sha1").update(jpeg).digest("hex")

  return { screenshot: jpeg, hash }
}

// CDP action executors
async function executeAction(action: AgentAction): Promise<"ok" | "blocked" | "error"> {
  if (!browserView) throw new Error("BrowserView not initialized")
  const debugger_ = browserView.webContents.debugger

  try {
    debugger_.attach("1.3")
  } catch (err) {
    if (!(err instanceof Error && err.message.includes("Already attached"))) throw err
  }

  try {
    const bounds = browserView.getBounds()

    switch (action.kind) {
      case "click":
      case "double_click": {
        // Validate coordinates
        if (action.x === undefined || action.y === undefined) return "blocked"
        if (action.x < 0 || action.x > bounds.width || action.y < 0 || action.y > bounds.height) {
          return "blocked"
        }

        const clickCount = action.kind === "double_click" ? 2 : 1
        await debugger_.sendCommand("Input.dispatchMouseEvent", {
          type: "mousePressed", x: action.x, y: action.y, button: "left", clickCount
        })
        await debugger_.sendCommand("Input.dispatchMouseEvent", {
          type: "mouseReleased", x: action.x, y: action.y, button: "left", clickCount
        })
        return "ok"
      }

      case "type": {
        if (!action.text) return "blocked"

        // Check if focused element is form-capable
        const canType = await browserView.webContents.executeJavaScript(`
          (() => {
            const el = document.activeElement
            if (!el) return false
            const tag = el.tagName.toLowerCase()
            if (tag === "input" || tag === "textarea") return true
            if (el.isContentEditable) return true
            return false
          })()
        `)

        if (!canType) return "blocked"

        await debugger_.sendCommand("Input.insertText", { text: action.text })
        return "ok"
      }

      case "scroll": {
        const dx = action.dx || 0
        const dy = action.dy || 0
        if (dx === 0 && dy === 0) return "blocked"

        await browserView.webContents.executeJavaScript(`window.scrollBy(${dx}, ${dy})`)
        return "ok"
      }

      case "keypress": {
        if (!action.key) return "blocked"

        const keyMap: Record<string, { key: string; code: string }> = {
          Tab: { key: "Tab", code: "Tab" },
          Enter: { key: "Enter", code: "Enter" },
          Escape: { key: "Escape", code: "Escape" },
        }
        const keyInfo = keyMap[action.key]
        if (!keyInfo) return "blocked"

        await debugger_.sendCommand("Input.dispatchKeyEvent", {
          type: "keyDown", key: keyInfo.key, code: keyInfo.code
        })
        await debugger_.sendCommand("Input.dispatchKeyEvent", {
          type: "keyUp", key: keyInfo.key, code: keyInfo.code
        })
        return "ok"
      }

      case "wait": {
        const ms = action.ms || 800
        await new Promise(resolve => setTimeout(resolve, ms))
        return "ok"
      }

      case "done":
        return "ok"

      default:
        return "blocked"
    }
  } finally {
    try { debugger_.detach() } catch { /* ignore */ }
  }
}

// Vision agent loop
async function runVisionAgent(
  goal: string,
  provider: CliProvider,
  onProgress: (progress: AgentProgress) => void
): Promise<AgentSummary> {
  const startTime = Date.now()
  const recentActions: AgentActionResult[] = []
  let previousHash = ""
  let consecutiveNoChange = 0

  onProgress({ phase: "starting", step: 0, totalSteps: AGENT_MAX_STEPS, message: "Initializing agent..." })

  for (let step = 1; step <= AGENT_MAX_STEPS; step++) {
    // 1. Capture screenshot + hash
    const { screenshot, hash } = await capturePage()

    onProgress({
      phase: "running",
      step,
      totalSteps: AGENT_MAX_STEPS,
      message: `Step ${step}: Analyzing page...`,
      screenshotHash: hash,
    })

    // 2. Get current URL
    const url = browserView?.webContents.getURL() || ""

    // 3. Build prompt and call CLI
    const prompt = buildAgentPrompt(goal, url, recentActions.slice(-3), previousHash, screenshot)

    let action: AgentAction
    try {
      action = await runAgentCli(provider, prompt)
    } catch (err) {
      // Retry once on parse failure
      try {
        action = await runAgentCli(provider, prompt)
      } catch (retryErr) {
        return {
          stepsUsed: step,
          stopReason: "error",
          elapsedMs: Date.now() - startTime,
          finalReason: retryErr instanceof Error ? retryErr.message : "CLI parse failure",
        }
      }
    }

    // 4. Check for done action
    if (action.kind === "done") {
      onProgress({ phase: "completed", step, totalSteps: AGENT_MAX_STEPS, message: action.reason || "Agent completed" })
      return {
        stepsUsed: step,
        stopReason: "done",
        elapsedMs: Date.now() - startTime,
        finalReason: action.reason,
      }
    }

    // 5. Execute action
    onProgress({
      phase: "running",
      step,
      totalSteps: AGENT_MAX_STEPS,
      currentAction: action,
      message: `Step ${step}: ${action.kind}...`,
    })

    const result = await executeAction(action)
    recentActions.push({ step, action, result })

    onProgress({
      phase: "running",
      step,
      totalSteps: AGENT_MAX_STEPS,
      currentAction: action,
      lastResult: result,
      message: `Step ${step}: ${action.kind} → ${result}`,
    })

    // 6. Check for stuck (consecutive no-change, excluding wait)
    if (action.kind !== "wait") {
      if (hash === previousHash) {
        consecutiveNoChange++
        if (consecutiveNoChange >= AGENT_STUCK_HASH_THRESHOLD) {
          onProgress({ phase: "failed", step, totalSteps: AGENT_MAX_STEPS, message: "Agent stuck - no visual progress" })
          return {
            stepsUsed: step,
            stopReason: "stuck",
            elapsedMs: Date.now() - startTime,
            finalReason: `No visual change after ${AGENT_STUCK_HASH_THRESHOLD} consecutive actions`,
          }
        }
      } else {
        consecutiveNoChange = 0
      }
    }

    previousHash = hash

    // Log telemetry
    logger.info(`[Agent] Step ${step}: ${action.kind} → ${result}, hash=${hash.slice(0, 8)}, bytes=${screenshot.length}`)
  }

  // Hit step limit
  onProgress({ phase: "failed", step: AGENT_MAX_STEPS, totalSteps: AGENT_MAX_STEPS, message: "Step limit reached" })
  return {
    stepsUsed: AGENT_MAX_STEPS,
    stopReason: "limit",
    elapsedMs: Date.now() - startTime,
    finalReason: `Reached ${AGENT_MAX_STEPS} step limit`,
  }
}

// Agent prompt builder
function buildAgentPrompt(
  goal: string,
  url: string,
  recentActions: AgentActionResult[],
  previousHash: string,
  screenshot: Buffer
): string {
  const recentStr = recentActions.length > 0
    ? recentActions.map(a => `${a.action.kind} → ${a.result}`).join(", ")
    : "none"

  const base64 = screenshot.toString("base64")

  return `You automate a job application form.
Goal: ${goal}
URL: ${url}
Recent actions: ${recentStr}
Previous screenshot hash: ${previousHash || "none"}
Screenshot (base64 JPEG): data:image/jpeg;base64,${base64}

Return exactly one JSON object matching the schema. Prefer click → type → Tab/Enter to submit. Use done when the form is submitted or you are blocked.

Schema:
{
  "action": {
    "kind": "click" | "double_click" | "type" | "scroll" | "keypress" | "wait" | "done",
    "x": number,        // for click/double_click
    "y": number,        // for click/double_click
    "text": "string",   // for type
    "dx": number,       // for scroll
    "dy": number,       // for scroll
    "key": "Tab" | "Enter" | "Escape" | "Backspace" | "SelectAll",  // for keypress
    "ms": number,       // for wait
    "reason": "string"  // for done
  }
}`
}

// Agent CLI runner (JSON output, single action)
async function runAgentCli(provider: CliProvider, prompt: string): Promise<AgentAction> {
  const [cmd, args] = getCliCommand(provider)

  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args)
    let stdout = ""
    let stderr = ""

    const timeout = setTimeout(() => {
      child.kill("SIGTERM")
      reject(new Error(`${provider} CLI timed out`))
    }, AGENT_LOOP_TIMEOUT_MS)

    child.stdin.write(prompt)
    child.stdin.end()

    child.stdout.on("data", d => (stdout += d))
    child.stderr.on("data", d => (stderr += d))

    child.on("close", code => {
      clearTimeout(timeout)
      if (code !== 0) {
        reject(new Error(`${provider} CLI failed (exit ${code}): ${stderr || stdout}`))
        return
      }

      try {
        const parsed = parseCliObjectOutput(stdout)
        const action = parsed.action as AgentAction
        if (!action || !action.kind) {
          throw new Error("Missing action.kind in response")
        }
        resolve(action)
      } catch (err) {
        reject(new Error(`${provider} CLI returned invalid JSON: ${err}`))
      }
    })
  })
}
```

**Add new IPC handler:**

```typescript
// Agent-based form fill (replaces fill-form)
ipcMain.handle(
  "agent-fill",
  async (
    _event: IpcMainInvokeEvent,
    options: { provider: CliProvider; goal: string }
  ): Promise<{ success: boolean; data?: AgentSummary; message?: string }> => {
    try {
      if (!browserView) throw new Error("BrowserView not initialized")

      const summary = await runVisionAgent(
        options.goal,
        options.provider,
        (progress) => {
          if (mainWindow) {
            mainWindow.webContents.send("agent-progress", progress)
          }
        }
      )

      const success = summary.stopReason === "done"
      return {
        success,
        data: summary,
        message: success ? "Form filled successfully" : summary.finalReason,
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error("Agent fill error:", message)
      return { success: false, message }
    }
  }
)
```

#### `job-applicator/src/preload.ts`

Replace `fillForm` and `onFormFillProgress` with agent equivalents:

```typescript
// Replace:
fillForm: (options: { provider: "claude" | "codex" | "gemini"; jobMatchId?: string; documentId?: string }) =>
  ipcRenderer.invoke("fill-form", options),
onFormFillProgress: (callback: (progress: FormFillProgress) => void) => { ... },

// With:
agentFill: (options: { provider: "claude" | "codex" | "gemini"; goal: string }) =>
  ipcRenderer.invoke("agent-fill", options),
onAgentProgress: (callback: (progress: AgentProgress) => void) => {
  const handler = (_event: IpcRendererEvent, progress: AgentProgress) => callback(progress)
  ipcRenderer.on("agent-progress", handler)
  return () => ipcRenderer.removeListener("agent-progress", handler)
},
```

#### `job-applicator/src/renderer/app.ts`

**Delete:**
- `handleFormFillProgress()` function
- `showFormFillProgress()` function
- `hideFormFillProgress()` function
- `renderFillResults()` function
- `unsubscribeFormFillProgress` variable

**Update `fillForm()` function → `agentFill()`:**

```typescript
// Track agent progress subscription
let unsubscribeAgentProgress: (() => void) | null = null

function handleAgentProgress(progress: AgentProgress) {
  const percent = Math.round((progress.step / progress.totalSteps) * 100)

  fillOutput.innerHTML = `
    <div class="agent-progress">
      <div class="agent-phase">${escapeHtml(progress.message)}</div>
      <div class="agent-progress-bar">
        <div class="agent-progress-fill" style="width: ${percent}%"></div>
      </div>
      <div class="agent-step">Step ${progress.step} / ${progress.totalSteps}</div>
      ${progress.currentAction ? `<div class="agent-action">${escapeHtml(progress.currentAction.kind)}${progress.lastResult ? ` → ${progress.lastResult}` : ""}</div>` : ""}
    </div>
  `

  if (progress.phase === "completed") {
    setStatus("Agent completed successfully", "success")
    setWorkflowStep("fill", "completed")
    setWorkflowStep("submit", "active")
  } else if (progress.phase === "failed") {
    setStatus(progress.message, "error")
  } else {
    setStatus(progress.message, "loading")
  }
}

async function agentFill() {
  const provider = providerSelect.value as "claude" | "codex" | "gemini"

  // Build goal from job context
  const match = jobMatches.find(m => m.id === selectedJobMatchId)
  const goal = match
    ? `Fill out this job application form for ${match.listing.title} at ${match.listing.companyName}. Use my profile information to complete all fields.`
    : "Fill out this job application form using my profile information."

  try {
    setButtonsEnabled(false)
    setStatus(`Starting agent with ${provider}...`, "loading")
    setWorkflowStep("fill", "active")

    // Clean up existing subscription
    if (unsubscribeAgentProgress) {
      unsubscribeAgentProgress()
      unsubscribeAgentProgress = null
    }

    // Subscribe to progress events
    unsubscribeAgentProgress = api.onAgentProgress(handleAgentProgress)

    const result = await api.agentFill({ provider, goal })
    // Note: unsubscribe happens in finally block to handle both success and error paths

    if (result.success && result.data) {
      fillOutput.innerHTML = `
        <div class="agent-summary">
          <div class="agent-result success">✓ Completed</div>
          <div class="agent-stats">
            <div>Steps: ${result.data.stepsUsed}</div>
            <div>Time: ${(result.data.elapsedMs / 1000).toFixed(1)}s</div>
          </div>
          ${result.data.finalReason ? `<div class="agent-reason">${escapeHtml(result.data.finalReason)}</div>` : ""}
        </div>
      `
      setStatus("Agent completed", "success")
      setWorkflowStep("fill", "completed")
      setWorkflowStep("submit", "active")
    } else {
      setStatus(result.message || "Agent failed", "error")
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    setStatus(`Agent failed: ${message}`, "error")
  } finally {
    if (unsubscribeAgentProgress) {
      unsubscribeAgentProgress()
      unsubscribeAgentProgress = null
    }
    setButtonsEnabled(true)
  }
}
```

**Update button handler:**
```typescript
// Change from:
fillBtn.addEventListener("click", fillForm)
// To:
fillBtn.addEventListener("click", agentFill)
```

#### `job-applicator/src/utils.ts`

**Delete these functions (no longer used):**
- `formatWorkHistory()`
- `buildPrompt()`
- `buildEnhancedPrompt()`
- `buildPromptFromProfileText()`
- `validateFillInstruction()`
- `validateEnhancedFillInstruction()`

**Keep:**
- `parseCliObjectOutput()` - needed for agent action parsing
- `parseCliArrayOutput()` - may be useful for future
- All HTTP/fetch utilities
- `resolveDocumentPath()` - still needed for document uploads

### Code to Delete (Legacy Form Fill)

| Location | What to Delete |
|----------|----------------|
| `main.ts` | `EXTRACT_FORM_SCRIPT`, `fillFormField()`, `fill-form` handler, `runEnhancedCli()`, `runStreamingCli()`, `sendFormFillProgress()` |
| `types.ts` | `FormField`, `SelectOption`, `FillInstruction`, `EnhancedFillInstruction`, `FormFillSummary`, `FormFillProgress` |
| `preload.ts` | `fillForm()`, `onFormFillProgress()` |
| `renderer/app.ts` | `handleFormFillProgress()`, `showFormFillProgress()`, `hideFormFillProgress()`, `renderFillResults()`, `unsubscribeFormFillProgress` |
| `utils.ts` | `formatWorkHistory()`, `buildPrompt()`, `buildEnhancedPrompt()`, `buildPromptFromProfileText()`, `validateFillInstruction()`, `validateEnhancedFillInstruction()` |

### Tests to Add

#### `job-applicator/src/agent.test.ts`

```typescript
import { describe, it, expect } from "vitest"

// Action schema parser tests
describe("parseAgentAction", () => {
  it("parses click action with coordinates", () => {
    const json = '{"action":{"kind":"click","x":100,"y":200}}'
    const parsed = JSON.parse(json)
    expect(parsed.action.kind).toBe("click")
    expect(parsed.action.x).toBe(100)
    expect(parsed.action.y).toBe(200)
  })

  it("parses type action with text", () => {
    const json = '{"action":{"kind":"type","text":"hello@example.com"}}'
    const parsed = JSON.parse(json)
    expect(parsed.action.kind).toBe("type")
    expect(parsed.action.text).toBe("hello@example.com")
  })

  it("parses done action with reason", () => {
    const json = '{"action":{"kind":"done","reason":"Form submitted successfully"}}'
    const parsed = JSON.parse(json)
    expect(parsed.action.kind).toBe("done")
    expect(parsed.action.reason).toBe("Form submitted successfully")
  })

  it("rejects invalid action kind", () => {
    const json = '{"action":{"kind":"invalid"}}'
    const parsed = JSON.parse(json)
    expect(["click","double_click","type","scroll","keypress","wait","done"]).not.toContain(parsed.action.kind)
  })
})

// Hash-based no-change detection tests
describe("stuck detection", () => {
  it("detects stuck after threshold consecutive same hashes", () => {
    const hashes = ["abc123", "abc123", "abc123"]  // 3 same hashes
    const threshold = 3
    let consecutiveNoChange = 0

    for (const hash of hashes) {
      if (hash === hashes[0]) consecutiveNoChange++
    }

    expect(consecutiveNoChange).toBeGreaterThanOrEqual(threshold)
  })

  it("resets counter when hash changes", () => {
    const hashes = ["abc123", "abc123", "def456", "def456"]
    let consecutiveNoChange = 0
    let prevHash = ""

    for (const hash of hashes) {
      if (hash === prevHash) {
        consecutiveNoChange++
      } else {
        consecutiveNoChange = 0
      }
      prevHash = hash
    }

    expect(consecutiveNoChange).toBe(1)  // Only 1 match between the two "def456" hashes
  })
})
```

### Execution Order

1. **Add new types** to `types.ts`
2. **Add new functions** to `main.ts` (capturePage, executeAction, runVisionAgent, etc.)
3. **Add new IPC handler** `agent-fill` in `main.ts`
4. **Update preload.ts** with new IPC bridge
5. **Update renderer/app.ts** with new UI and handler
6. **Delete legacy code** from all files
7. **Add tests**
8. **Manual test** with real job application
