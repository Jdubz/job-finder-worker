> Status: Draft
> Owner: @jdubz
> Last Updated: 2025-12-11

# Implementation Plan: Persistent Agent Session Architecture

This document provides a comprehensive, step-by-step implementation plan for replacing the current one-shot CLI vision agent with a persistent PTY-based agent session. This is a **hard cutover** - all legacy code will be removed.

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Code Audit: What Exists Today](#code-audit-what-exists-today)
3. [Code Removal Plan](#code-removal-plan)
4. [Implementation Phases](#implementation-phases)
5. [File-by-File Changes](#file-by-file-changes)
6. [Testing Strategy](#testing-strategy)
7. [Rollback Plan](#rollback-plan)

---

## Executive Summary

### Scope
- **Remove**: One-shot CLI vision agent loop (~560 lines in main.ts)
- **Add**: Persistent PTY session with tool-based interaction (~800 new lines across 3 new files)
- **Modify**: Preload, renderer, HTML, CSS for new Agent Panel UI

### Key Changes
| Aspect | Current | New |
|--------|---------|-----|
| CLI lifecycle | Spawned per-action | Single persistent PTY session |
| Screenshot delivery | Pushed every iteration | Agent requests on-demand |
| Context | Re-sent every action | Loaded once at session start |
| User interaction | Click "Fill" → wait | Session persists, fill on command |

---

## Code Audit: What Exists Today

### main.ts - Vision Agent Code (TO BE REMOVED)

**Constants (lines 103-109)**
```typescript
const AGENT_MAX_STEPS = parseInt(process.env.AGENT_MAX_STEPS || "40", 10)
const AGENT_STUCK_HASH_THRESHOLD = parseInt(process.env.AGENT_STUCK_HASH_THRESHOLD || "3", 10)
const AGENT_LOOP_TIMEOUT_MS = 45000
const AGENT_ACTION_TIMEOUT_MS = 3000
const AGENT_RENDER_DELAY_MS = 500
const AGENT_SCREENSHOT_WIDTH = 1280
```

**Functions (lines 831-1350)**
| Function | Lines | Purpose | Reuse? |
|----------|-------|---------|--------|
| `capturePage()` | 838-860 | Screenshot + hash | **YES** - move to agent-tools.ts |
| `withTimeout()` | 865-878 | Promise timeout wrapper | **YES** - move to utils.ts |
| `executeAction()` | 884-896 | Action with timeout | **PARTIAL** - CDP logic reused |
| `executeActionInternal()` | 901-1077 | CDP action execution | **YES** - move to agent-tools.ts |
| `buildAgentPrompt()` | 1082-1126 | Build CLI prompt | **NO** - replaced by system prompt |
| `runAgentCli()` | 1131-1178 | Spawn CLI, parse action | **NO** - replaced by PTY session |
| `runVisionAgent()` | 1183-1350 | Main agent loop | **NO** - replaced by tool protocol |

**IPC Handler (lines 1360-1392)**
```typescript
ipcMain.handle("agent-fill", ...) // TO BE REMOVED
```

### types.ts - Agent Types (TO BE REMOVED)

**Lines 79-120**
```typescript
type AgentActionKind = "click" | "double_click" | "type" | "scroll" | "keypress" | "wait" | "done"
interface AgentAction { ... }
interface AgentActionResult { ... }
interface AgentProgress { ... }
interface AgentSummary { ... }
```

### preload.ts - Agent API (TO BE REPLACED)

**Lines 14-15, 52-57**
```typescript
agentFill: (options) => ipcRenderer.invoke("agent-fill", options)
onAgentProgress: (callback) => { ... }
```

### renderer/app.ts - Agent UI (TO BE REPLACED)

**State (line 680)**
```typescript
let unsubscribeAgentProgress: (() => void) | null = null
```

**Functions**
| Function | Lines | Purpose |
|----------|-------|---------|
| `handleAgentProgress()` | 683-706 | Update progress UI |
| `agentFill()` | 716-782 | Trigger agent fill |
| `renderAgentResults()` | 785-803 | Display summary |

### renderer/index.html - Form Fill Section (TO BE REPLACED)

**Lines 111-124**
```html
<section class="sidebar-section" id="fillSection">
  <h3 class="section-title">Form Fill</h3>
  <div class="fill-controls">...</div>
  <div class="fill-output" id="fillOutput">...</div>
</section>
```

### renderer/styles.css - Agent Styles (PARTIAL REUSE)

**Lines 478-866** - Form fill progress styles can be adapted for new Agent Panel.

---

## Code Removal Plan

### Phase 0: Remove Legacy Code (Before Adding New)

#### Step 0.1: Remove main.ts Vision Agent Code

**Remove constants (lines 103-109):**
```typescript
// DELETE THESE LINES:
const AGENT_MAX_STEPS = ...
const AGENT_STUCK_HASH_THRESHOLD = ...
const AGENT_LOOP_TIMEOUT_MS = ...
const AGENT_ACTION_TIMEOUT_MS = ...
const AGENT_RENDER_DELAY_MS = ...
const AGENT_SCREENSHOT_WIDTH = ...
```

**Remove functions (lines 831-1350):**
- `capturePage()` → Move to agent-tools.ts first, then delete from main.ts
- `withTimeout()` → Move to utils.ts first, then delete from main.ts
- `executeAction()` → Delete (logic moves to agent-tools.ts)
- `executeActionInternal()` → Move to agent-tools.ts first, then delete from main.ts
- `buildAgentPrompt()` → Delete entirely
- `runAgentCli()` → Delete entirely
- `runVisionAgent()` → Delete entirely

**Remove IPC handler (lines 1360-1392):**
```typescript
// DELETE THIS HANDLER:
ipcMain.handle("agent-fill", ...)
```

**Remove unused imports:**
```typescript
// Review and remove if unused after refactor:
import * as crypto from "crypto"  // Only used by capturePage hash
```

#### Step 0.2: Remove types.ts Agent Types

**Remove lines 79-120:**
```typescript
// DELETE THESE:
type AgentActionKind = ...
interface AgentAction { ... }
interface AgentActionResult { ... }
interface AgentProgress { ... }
interface AgentSummary { ... }
```

#### Step 0.3: Update preload.ts

**Remove lines 14-15:**
```typescript
// DELETE:
agentFill: (options) => ipcRenderer.invoke("agent-fill", options),
```

**Remove lines 52-57:**
```typescript
// DELETE:
onAgentProgress: (callback) => { ... }
```

#### Step 0.4: Update renderer/app.ts

**Remove state variable (line 680):**
```typescript
// DELETE:
let unsubscribeAgentProgress: (() => void) | null = null
```

**Remove functions:**
- `handleAgentProgress()` (lines 683-706)
- `agentFill()` (lines 716-782)
- `renderAgentResults()` (lines 785-803)

**Update ElectronAPI interface:**
- Remove `agentFill` method
- Remove `onAgentProgress` method

**Remove event listeners:**
- Remove `fillBtn.addEventListener("click", agentFill)` (line 881)

---

## Implementation Phases

### Phase 1: Core Infrastructure

#### 1.1 Add node-pty Dependency

```bash
cd job-applicator
npm install node-pty --save
```

**Platform Considerations:**

node-pty is a native module that requires compilation. For Electron:

1. **Windows (Primary Platform)**
   - Requires Visual Studio Build Tools or Windows Build Tools
   - Run: `npx electron-rebuild` after install
   - Use `conpty` backend (default on Windows 10+)

2. **Installation Steps:**
   ```bash
   # Install node-pty
   npm install node-pty --save

   # Rebuild for Electron
   npx electron-rebuild

   # Verify installation
   npm run build && npm run dev
   ```

3. **If rebuild fails:**
   ```bash
   # Clear node_modules and reinstall
   rm -rf node_modules package-lock.json
   npm install
   npx electron-rebuild
   ```

4. **Add to .gitignore (if not present):**
   ```
   # Native module build artifacts
   build/
   Release/
   ```

#### 1.2 Move Reusable Code to New Locations

**utils.ts additions:**
```typescript
/**
 * Wrap a promise with a timeout.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, errorMsg: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(errorMsg)), ms)
    promise
      .then((result) => { clearTimeout(timer); resolve(result) })
      .catch((err) => { clearTimeout(timer); reject(err) })
  })
}
```

#### 1.3 Create agent-session.ts

**Location**: `src/agent-session.ts`

**Purpose**: PTY session management, tool call parsing, state machine

**Class Structure**:
```typescript
import * as pty from "node-pty"
import { EventEmitter } from "events"
import { logger } from "./logger.js"

export type AgentSessionState = "idle" | "working" | "stopped"

export interface AgentSessionEvents {
  "state-change": (state: AgentSessionState) => void
  "output": (text: string) => void
  "tool-call": (tool: ToolCall) => void
  "error": (error: Error) => void
}

export interface ToolCall {
  name: string
  params: Record<string, unknown>
}

export interface ToolResult {
  success: boolean
  data?: unknown
  error?: string
}

export class AgentSession extends EventEmitter {
  private pty: pty.IPty | null = null
  private state: AgentSessionState = "stopped"
  private buffer: string = ""
  private profileText: string = ""
  private currentJobContext: string = ""

  // Tool call parsing state
  private readonly TOOL_START = "<tool>"
  private readonly TOOL_END = "</tool>"

  constructor() {
    super()
  }

  getState(): AgentSessionState {
    return this.state
  }

  /**
   * Start a new agent session with context
   */
  async start(options: {
    profileText: string
    provider?: "claude" | "codex" | "gemini"
  }): Promise<void> {
    if (this.pty) {
      await this.stop()
    }

    this.profileText = options.profileText
    this.state = "idle"
    this.emit("state-change", this.state)

    const shell = this.getShellCommand(options.provider || "claude")

    this.pty = pty.spawn(shell.cmd, shell.args, {
      name: "xterm-color",
      cwd: process.cwd(),
      env: process.env as Record<string, string>,
    })

    this.pty.onData((data) => this.handleOutput(data))
    this.pty.onExit(({ exitCode }) => {
      logger.info(`[AgentSession] PTY exited with code ${exitCode}`)
      this.state = "stopped"
      this.emit("state-change", this.state)
    })

    // Inject system prompt
    await this.injectSystemPrompt()

    logger.info("[AgentSession] Session started")
  }

  /**
   * Stop the agent session
   */
  async stop(): Promise<void> {
    if (this.pty) {
      this.pty.kill()
      this.pty = null
    }
    this.state = "stopped"
    this.buffer = ""
    this.emit("state-change", this.state)
    logger.info("[AgentSession] Session stopped")
  }

  /**
   * Send a command to the agent
   */
  sendCommand(command: string): void {
    if (!this.pty || this.state === "stopped") {
      throw new Error("Agent session not running")
    }

    this.state = "working"
    this.emit("state-change", this.state)

    this.pty.write(command + "\n")
    logger.info(`[AgentSession] Sent command: ${command.slice(0, 100)}...`)
  }

  /**
   * Send tool result back to agent
   */
  sendToolResult(result: ToolResult): void {
    if (!this.pty) return

    const resultJson = JSON.stringify(result)
    this.pty.write(`<result>${resultJson}</result>\n`)
    logger.info(`[AgentSession] Sent tool result: ${result.success}`)
  }

  /**
   * Update job context for next fill
   */
  setJobContext(context: string): void {
    this.currentJobContext = context
  }

  private getShellCommand(provider: string): { cmd: string; args: string[] } {
    // Use existing CLI config
    const configs: Record<string, { cmd: string; args: string[] }> = {
      claude: {
        cmd: "claude",
        args: ["--print", "--output-format", "json", "--dangerously-skip-permissions", "-p", "-"],
      },
      codex: {
        cmd: "codex",
        args: ["exec", "--json", "--skip-git-repo-check", "--dangerously-bypass-approvals-and-sandbox"],
      },
      gemini: {
        cmd: "gemini",
        args: ["-o", "json", "--yolo"],
      },
    }
    return configs[provider] || configs.claude
  }

  private async injectSystemPrompt(): Promise<void> {
    const systemPrompt = this.buildSystemPrompt()
    this.pty?.write(systemPrompt + "\n")
  }

  private buildSystemPrompt(): string {
    return `You are a job application form filler assistant. You help fill out job
application forms using the user's profile data. You have access to tools
that let you see and interact with web pages.

AVAILABLE TOOLS:
- screenshot: Request current page view (call when you need to see the page)
- get_form_fields: Get structured list of form inputs with labels
- get_page_info: Get current URL and page title
- click(x, y): Click at coordinates on the page (1280px wide reference)
- type(text): Type text into the currently focused field
- scroll(dy): Scroll the page (positive = down, negative = up)
- keypress(key): Press Tab, Enter, Escape, Backspace, or SelectAll
- generate_resume: Generate a tailored resume (if form requires file upload)
- generate_cover_letter: Generate a cover letter (if form requires)
- upload_file(type): Upload 'resume' or 'coverLetter' to file input
- done(summary): Call when form is completely filled

RULES:
1. Start by requesting a screenshot to see the current page state
2. Use get_form_fields to understand form structure when helpful
3. Fill fields using the user's profile data - be accurate
4. If the form has file upload fields, generate and upload documents
5. DO NOT click submit buttons - call done() when form is filled
6. If you encounter an error, try an alternative approach
7. Call done() with a summary of what was filled

Call tools using: <tool>{"name": "...", "param": "value"}</tool>

USER PROFILE:
${this.profileText}

CURRENT JOB:
${this.currentJobContext || "(No job selected yet)"}

Respond with "Ready" when you understand.`
  }

  private handleOutput(data: string): void {
    this.buffer += data
    this.emit("output", data)

    // Parse tool calls from buffer
    this.parseToolCalls()
  }

  private parseToolCalls(): void {
    let startIdx = this.buffer.indexOf(this.TOOL_START)

    while (startIdx !== -1) {
      const endIdx = this.buffer.indexOf(this.TOOL_END, startIdx)

      if (endIdx === -1) {
        // Incomplete tool call, wait for more data
        break
      }

      const toolJson = this.buffer.substring(
        startIdx + this.TOOL_START.length,
        endIdx
      )

      // Remove parsed tool call from buffer
      this.buffer = this.buffer.substring(endIdx + this.TOOL_END.length)

      try {
        const toolCall = JSON.parse(toolJson) as ToolCall
        logger.info(`[AgentSession] Tool call: ${toolCall.name}`)
        this.emit("tool-call", toolCall)
      } catch (err) {
        logger.error(`[AgentSession] Failed to parse tool call: ${toolJson}`)
        this.emit("error", new Error(`Invalid tool call JSON: ${toolJson}`))
      }

      startIdx = this.buffer.indexOf(this.TOOL_START)
    }

    // Check if agent signaled done
    if (this.buffer.includes('"name":"done"') || this.buffer.includes('"name": "done"')) {
      this.state = "idle"
      this.emit("state-change", this.state)
    }
  }
}

// Singleton instance
let agentSession: AgentSession | null = null

export function getAgentSession(): AgentSession {
  if (!agentSession) {
    agentSession = new AgentSession()
  }
  return agentSession
}
```

#### 1.4 Create agent-tools.ts

**Location**: `src/agent-tools.ts`

**Purpose**: Tool handler implementations

```typescript
import type { BrowserView } from "electron"
import * as crypto from "crypto"
import { logger } from "./logger.js"
import { withTimeout } from "./utils.js"
import type { ToolCall, ToolResult } from "./agent-session.js"
import {
  startGeneration,
  executeGenerationStep,
  fetchApplicatorProfile,
} from "./api-client.js"

// Configuration
const SCREENSHOT_WIDTH = 1280
const ACTION_TIMEOUT_MS = 3000

// Reference to BrowserView (set by main.ts)
let browserView: BrowserView | null = null

export function setBrowserView(view: BrowserView | null): void {
  browserView = view
}

/**
 * Execute a tool call and return the result
 */
export async function executeTool(tool: ToolCall): Promise<ToolResult> {
  const { name, params } = tool

  logger.info(`[AgentTools] Executing: ${name}`)

  try {
    switch (name) {
      case "screenshot":
        return await handleScreenshot()

      case "get_form_fields":
        return await handleGetFormFields()

      case "get_page_info":
        return await handleGetPageInfo()

      case "click":
        return await handleClick(params as { x: number; y: number })

      case "type":
        return await handleType(params as { text: string })

      case "scroll":
        return await handleScroll(params as { dy: number })

      case "keypress":
        return await handleKeypress(params as { key: string })

      case "generate_resume":
        return await handleGenerateDocument("resume", params as { jobMatchId: string })

      case "generate_cover_letter":
        return await handleGenerateDocument("coverLetter", params as { jobMatchId: string })

      case "upload_file":
        return await handleUploadFile(params as { type: "resume" | "coverLetter" })

      case "done":
        return { success: true, data: { summary: (params as { summary?: string }).summary } }

      default:
        return { success: false, error: `Unknown tool: ${name}` }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error(`[AgentTools] ${name} failed: ${message}`)
    return { success: false, error: message }
  }
}

// ============================================================================
// Tool Handlers
// ============================================================================

async function handleScreenshot(): Promise<ToolResult> {
  if (!browserView) {
    return { success: false, error: "BrowserView not initialized" }
  }

  const nativeImage = await browserView.webContents.capturePage()
  const size = nativeImage.getSize()

  let resized = nativeImage
  if (size.width > SCREENSHOT_WIDTH) {
    const scale = SCREENSHOT_WIDTH / size.width
    const newHeight = Math.round(size.height * scale)
    resized = nativeImage.resize({ width: SCREENSHOT_WIDTH, height: newHeight, quality: "good" })
  }

  const jpeg = resized.toJPEG(60)
  const base64 = jpeg.toString("base64")
  const hash = crypto.createHash("sha1").update(jpeg).digest("hex")

  return {
    success: true,
    data: {
      image: `data:image/jpeg;base64,${base64}`,
      width: SCREENSHOT_WIDTH,
      height: resized.getSize().height,
      hash,
    },
  }
}

async function handleGetFormFields(): Promise<ToolResult> {
  if (!browserView) {
    return { success: false, error: "BrowserView not initialized" }
  }

  const fields = await browserView.webContents.executeJavaScript(`
    (() => {
      const inputs = document.querySelectorAll('input, select, textarea');
      return Array.from(inputs).map((el, idx) => {
        const rect = el.getBoundingClientRect();
        const label = document.querySelector(\`label[for="\${el.id}"]\`)?.textContent?.trim() ||
                      el.getAttribute('aria-label') ||
                      el.getAttribute('placeholder') ||
                      el.name ||
                      'unknown';
        return {
          index: idx,
          type: el.type || el.tagName.toLowerCase(),
          name: el.name,
          id: el.id,
          label,
          value: el.value,
          x: Math.round(rect.left + rect.width / 2),
          y: Math.round(rect.top + rect.height / 2),
          required: el.required,
          disabled: el.disabled,
        };
      }).filter(f => f.type !== 'hidden');
    })()
  `)

  return { success: true, data: { fields } }
}

async function handleGetPageInfo(): Promise<ToolResult> {
  if (!browserView) {
    return { success: false, error: "BrowserView not initialized" }
  }

  const url = browserView.webContents.getURL()
  const title = await browserView.webContents.executeJavaScript("document.title")

  return { success: true, data: { url, title } }
}

async function handleClick(params: { x: number; y: number }): Promise<ToolResult> {
  if (!browserView) {
    return { success: false, error: "BrowserView not initialized" }
  }

  const { x, y } = params
  const bounds = browserView.getBounds()
  const scale = bounds.width > SCREENSHOT_WIDTH ? bounds.width / SCREENSHOT_WIDTH : 1

  const scaledX = Math.round(x * scale)
  const scaledY = Math.round(y * scale)

  if (scaledX > bounds.width || scaledY > bounds.height || x < 0 || y < 0) {
    return { success: false, error: `Coordinates out of bounds: (${x}, ${y})` }
  }

  const debugger_ = browserView.webContents.debugger

  try {
    debugger_.attach("1.3")
  } catch (err) {
    if (!(err instanceof Error && err.message.includes("Already attached"))) throw err
  }

  try {
    await debugger_.sendCommand("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x: scaledX,
      y: scaledY,
      button: "left",
      clickCount: 1,
    })
    await debugger_.sendCommand("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: scaledX,
      y: scaledY,
      button: "left",
      clickCount: 1,
    })

    return { success: true }
  } finally {
    try { debugger_.detach() } catch { /* ignore */ }
  }
}

async function handleType(params: { text: string }): Promise<ToolResult> {
  if (!browserView) {
    return { success: false, error: "BrowserView not initialized" }
  }

  const { text } = params
  if (!text) {
    return { success: false, error: "No text provided" }
  }

  // Check if focused element can receive text
  const canType = await browserView.webContents.executeJavaScript(`
    (() => {
      const el = document.activeElement;
      if (!el) return false;
      const tag = el.tagName.toLowerCase();
      return tag === 'input' || tag === 'textarea' || el.isContentEditable;
    })()
  `)

  if (!canType) {
    return { success: false, error: "Focused element cannot receive text input" }
  }

  const debugger_ = browserView.webContents.debugger

  try {
    debugger_.attach("1.3")
  } catch (err) {
    if (!(err instanceof Error && err.message.includes("Already attached"))) throw err
  }

  try {
    await debugger_.sendCommand("Input.insertText", { text })
    return { success: true }
  } finally {
    try { debugger_.detach() } catch { /* ignore */ }
  }
}

async function handleScroll(params: { dy: number }): Promise<ToolResult> {
  if (!browserView) {
    return { success: false, error: "BrowserView not initialized" }
  }

  const { dy } = params
  await browserView.webContents.executeJavaScript(`window.scrollBy(0, ${dy})`)

  return { success: true }
}

async function handleKeypress(params: { key: string }): Promise<ToolResult> {
  if (!browserView) {
    return { success: false, error: "BrowserView not initialized" }
  }

  const { key } = params
  const debugger_ = browserView.webContents.debugger

  try {
    debugger_.attach("1.3")
  } catch (err) {
    if (!(err instanceof Error && err.message.includes("Already attached"))) throw err
  }

  try {
    if (key === "SelectAll") {
      // Ctrl+A sequence
      await debugger_.sendCommand("Input.dispatchKeyEvent", {
        type: "keyDown", key: "Control", code: "ControlLeft",
        windowsVirtualKeyCode: 17, nativeVirtualKeyCode: 17, modifiers: 2,
      })
      await debugger_.sendCommand("Input.dispatchKeyEvent", {
        type: "keyDown", key: "a", code: "KeyA",
        windowsVirtualKeyCode: 65, nativeVirtualKeyCode: 65, modifiers: 2,
      })
      await debugger_.sendCommand("Input.dispatchKeyEvent", {
        type: "keyUp", key: "a", code: "KeyA",
        windowsVirtualKeyCode: 65, nativeVirtualKeyCode: 65, modifiers: 2,
      })
      await debugger_.sendCommand("Input.dispatchKeyEvent", {
        type: "keyUp", key: "Control", code: "ControlLeft",
        windowsVirtualKeyCode: 17, nativeVirtualKeyCode: 17, modifiers: 0,
      })
      return { success: true }
    }

    const keyMap: Record<string, { key: string; code: string; keyCode: number }> = {
      Tab: { key: "Tab", code: "Tab", keyCode: 9 },
      Enter: { key: "Enter", code: "Enter", keyCode: 13 },
      Escape: { key: "Escape", code: "Escape", keyCode: 27 },
      Backspace: { key: "Backspace", code: "Backspace", keyCode: 8 },
    }

    const keyInfo = keyMap[key]
    if (!keyInfo) {
      return { success: false, error: `Unknown key: ${key}` }
    }

    await debugger_.sendCommand("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: keyInfo.key,
      code: keyInfo.code,
      windowsVirtualKeyCode: keyInfo.keyCode,
      nativeVirtualKeyCode: keyInfo.keyCode,
    })
    await debugger_.sendCommand("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: keyInfo.key,
      code: keyInfo.code,
      windowsVirtualKeyCode: keyInfo.keyCode,
      nativeVirtualKeyCode: keyInfo.keyCode,
    })

    return { success: true }
  } finally {
    try { debugger_.detach() } catch { /* ignore */ }
  }
}

async function handleGenerateDocument(
  type: "resume" | "coverLetter",
  params: { jobMatchId: string }
): Promise<ToolResult> {
  const { jobMatchId } = params

  if (!jobMatchId) {
    return { success: false, error: "No jobMatchId provided" }
  }

  try {
    // Start generation
    const startResult = await startGeneration({ jobMatchId, type })
    const requestId = startResult.requestId
    let nextStep = startResult.nextStep

    // Execute steps until complete
    let stepCount = 0
    const maxSteps = 20

    while (nextStep && stepCount < maxSteps) {
      stepCount++
      const stepResult = await executeGenerationStep(requestId)

      if (stepResult.status === "failed") {
        return { success: false, error: stepResult.error || "Generation failed" }
      }

      nextStep = stepResult.nextStep

      if (stepResult.status === "completed") {
        const url = type === "coverLetter" ? stepResult.coverLetterUrl : stepResult.resumeUrl
        return { success: true, data: { url, requestId } }
      }
    }

    return { success: false, error: "Generation did not complete" }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}

async function handleUploadFile(params: { type: "resume" | "coverLetter"; documentId?: string }): Promise<ToolResult> {
  if (!browserView) {
    return { success: false, error: "BrowserView not initialized" }
  }

  const { type, documentId } = params

  // Find file input selector
  const fileInputSelector = await browserView.webContents.executeJavaScript(`
    (() => {
      const fileInput = document.querySelector('input[type="file"]');
      if (!fileInput) return null;
      if (fileInput.id) return '#' + CSS.escape(fileInput.id);
      if (fileInput.name) return 'input[type="file"][name="' + CSS.escape(fileInput.name) + '"]';
      return 'input[type="file"]';
    })()
  `)

  if (!fileInputSelector) {
    return { success: false, error: "No file input found on page" }
  }

  // If documentId provided, fetch document path from API
  // Otherwise agent must have already generated and stored path
  if (!documentId) {
    return { success: false, error: "documentId required for upload" }
  }

  try {
    const { fetchGeneratorRequest } = await import("./api-client.js")
    const doc = await fetchGeneratorRequest(documentId)

    const docUrl = type === "coverLetter" ? doc.coverLetterUrl : doc.resumeUrl
    if (!docUrl) {
      return { success: false, error: `No ${type} file found for document` }
    }

    const { resolveDocumentPath, getConfig } = await import("./utils.js")
    const config = getConfig()
    const filePath = resolveDocumentPath(docUrl, config.ARTIFACTS_DIR)

    const fs = await import("fs")
    if (!fs.existsSync(filePath)) {
      return { success: false, error: `File not found: ${filePath}` }
    }

    // Use CDP to set files on input
    const debugger_ = browserView.webContents.debugger
    try { debugger_.attach("1.3") } catch { /* already attached */ }

    try {
      const { root } = await debugger_.sendCommand("DOM.getDocument", {})
      const { nodeId } = await debugger_.sendCommand("DOM.querySelector", {
        nodeId: root.nodeId,
        selector: fileInputSelector,
      })

      if (!nodeId) {
        return { success: false, error: "File input node not found" }
      }

      await debugger_.sendCommand("DOM.setFileInputFiles", {
        nodeId,
        files: [filePath],
      })

      return { success: true, data: { filePath } }
    } finally {
      try { debugger_.detach() } catch { /* ignore */ }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}

// Export profile fetcher for session initialization
export { fetchApplicatorProfile }
```

### Phase 2: IPC Integration

#### 2.1 Add IPC Handlers to main.ts

**Add after existing IPC handlers (around line 730):**

```typescript
import { getAgentSession, AgentSession } from "./agent-session.js"
import { executeTool, setBrowserView } from "./agent-tools.js"

// Wire up BrowserView to agent tools when created
// In createWindow(), after browserView is created:
// setBrowserView(browserView)

// Agent Session IPC Handlers

ipcMain.handle("agent-start-session", async (
  _event: IpcMainInvokeEvent,
  options: { provider?: "claude" | "codex" | "gemini" }
): Promise<{ success: boolean; message?: string }> => {
  try {
    const session = getAgentSession()

    // Fetch profile
    const profileText = await fetchApplicatorProfile()

    // Start session
    await session.start({
      profileText,
      provider: options.provider,
    })

    // Set up tool call handler
    session.on("tool-call", async (tool) => {
      const result = await executeTool(tool)
      session.sendToolResult(result)
    })

    // Forward output to renderer
    session.on("output", (text) => {
      mainWindow?.webContents.send("agent-output", { text })
    })

    // Forward state changes
    session.on("state-change", (state) => {
      mainWindow?.webContents.send("agent-status", { state })
    })

    logger.info("[Agent] Session started")
    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error("[Agent] Failed to start session:", message)
    return { success: false, message }
  }
})

ipcMain.handle("agent-stop-session", async (): Promise<{ success: boolean }> => {
  const session = getAgentSession()
  await session.stop()
  return { success: true }
})

ipcMain.handle("agent-send-command", async (
  _event: IpcMainInvokeEvent,
  command: string
): Promise<{ success: boolean; message?: string }> => {
  try {
    const session = getAgentSession()
    session.sendCommand(command)
    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, message }
  }
})

ipcMain.handle("agent-fill-form", async (
  _event: IpcMainInvokeEvent,
  options: { jobMatchId: string; jobContext: string }
): Promise<{ success: boolean; message?: string }> => {
  try {
    const session = getAgentSession()

    if (session.getState() === "stopped") {
      return { success: false, message: "Agent session not running. Start session first." }
    }

    // Update job context
    session.setJobContext(options.jobContext)

    // Send fill command
    session.sendCommand(`Fill out this job application form. Job context: ${options.jobContext}`)

    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, message }
  }
})

ipcMain.handle("agent-get-status", async (): Promise<{ state: string }> => {
  const session = getAgentSession()
  return { state: session.getState() }
})
```

### Phase 3: Preload & Renderer

#### 3.1 Update preload.ts

**Replace agent methods with:**

```typescript
// Agent Session
agentStartSession: (options?: { provider?: "claude" | "codex" | "gemini" }) =>
  ipcRenderer.invoke("agent-start-session", options || {}),
agentStopSession: () => ipcRenderer.invoke("agent-stop-session"),
agentSendCommand: (command: string) => ipcRenderer.invoke("agent-send-command", command),
agentFillForm: (options: { jobMatchId: string; jobContext: string }) =>
  ipcRenderer.invoke("agent-fill-form", options),
agentGetStatus: () => ipcRenderer.invoke("agent-get-status"),

// Agent events
onAgentOutput: (callback: (data: { text: string }) => void) => {
  const handler = (_event: IpcRendererEvent, data: { text: string }) => callback(data)
  ipcRenderer.on("agent-output", handler)
  return () => ipcRenderer.removeListener("agent-output", handler)
},
onAgentStatus: (callback: (data: { state: string }) => void) => {
  const handler = (_event: IpcRendererEvent, data: { state: string }) => callback(data)
  ipcRenderer.on("agent-status", handler)
  return () => ipcRenderer.removeListener("agent-status", handler)
},
```

#### 3.2 Update renderer/index.html

**Replace Form Fill Section (lines 111-124) with Agent Panel:**

```html
<!-- Agent Session Section -->
<section class="sidebar-section" id="agentSection">
  <div class="section-header">
    <h3 class="section-title">Agent Session</h3>
    <div class="agent-status" id="agentStatus">
      <span class="status-dot stopped"></span>
      <span class="status-text">Stopped</span>
    </div>
  </div>

  <div class="agent-controls">
    <select id="agentProviderSelect" class="provider-select">
      <option value="claude">Claude</option>
      <option value="codex">Codex</option>
      <option value="gemini">Gemini</option>
    </select>
    <button class="btn-start-session" id="startSessionBtn">Start Session</button>
    <button class="btn-stop-session hidden" id="stopSessionBtn">Stop</button>
  </div>

  <div class="agent-actions hidden" id="agentActions">
    <button class="btn-fill" id="fillFormBtn">Fill Form</button>
  </div>

  <div class="agent-command hidden" id="agentCommand">
    <input type="text" id="agentCommandInput" placeholder="Send command to agent..." />
    <button class="btn-send" id="sendCommandBtn">Send</button>
  </div>

  <div class="agent-output" id="agentOutput">
    <div class="empty-placeholder">Start session to begin</div>
  </div>
</section>
```

#### 3.3 Update renderer/styles.css

**Add Agent Panel styles:**

```css
/* Agent Session Styles */
.agent-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.status-dot.stopped {
  background: #6b7280;
}

.status-dot.idle {
  background: #10b981;
}

.status-dot.working {
  background: #fbbf24;
  animation: pulse 1s infinite;
}

.agent-controls {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.agent-controls .provider-select {
  flex: 1;
}

.btn-start-session {
  background: #10b981;
  color: #fff;
  padding: 8px 12px;
  font-size: 12px;
}

.btn-start-session:hover:not(:disabled) {
  background: #059669;
}

.btn-stop-session {
  background: #ef4444;
  color: #fff;
  padding: 8px 12px;
  font-size: 12px;
}

.agent-actions {
  margin-bottom: 12px;
}

.agent-command {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.agent-command input {
  flex: 1;
  padding: 8px;
  font-size: 12px;
  background: #1a1a2e;
  border: 1px solid #0f3460;
  border-radius: 4px;
  color: #eee;
}

.agent-command input:focus {
  outline: none;
  border-color: #e94560;
}

.btn-send {
  background: #0f3460;
  color: #eee;
  padding: 8px 12px;
  font-size: 12px;
}

.agent-output {
  min-height: 200px;
  max-height: 400px;
  overflow-y: auto;
  background: #1a1a2e;
  border-radius: 6px;
  padding: 12px;
  font-family: "SF Mono", Monaco, monospace;
  font-size: 11px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.agent-output .tool-call {
  background: rgba(233, 69, 96, 0.1);
  border-left: 2px solid #e94560;
  padding: 4px 8px;
  margin: 4px 0;
}

.agent-output .tool-result {
  background: rgba(16, 185, 129, 0.1);
  border-left: 2px solid #10b981;
  padding: 4px 8px;
  margin: 4px 0;
}
```

#### 3.4 Update renderer/app.ts

**Add new state variables:**
```typescript
// Agent session state
let agentSessionState: "idle" | "working" | "stopped" = "stopped"
let unsubscribeAgentOutput: (() => void) | null = null
let unsubscribeAgentStatus: (() => void) | null = null
```

**Add new DOM element references:**
```typescript
// Agent Panel elements
const agentStatus = getElement<HTMLDivElement>("agentStatus")
const agentProviderSelect = getElement<HTMLSelectElement>("agentProviderSelect")
const startSessionBtn = getElement<HTMLButtonElement>("startSessionBtn")
const stopSessionBtn = getElement<HTMLButtonElement>("stopSessionBtn")
const agentActions = getElement<HTMLDivElement>("agentActions")
const fillFormBtn = getElement<HTMLButtonElement>("fillFormBtn")
const agentCommand = getElement<HTMLDivElement>("agentCommand")
const agentCommandInput = getElement<HTMLInputElement>("agentCommandInput")
const sendCommandBtn = getElement<HTMLButtonElement>("sendCommandBtn")
const agentOutput = getElement<HTMLDivElement>("agentOutput")
```

**Add agent session functions:**
```typescript
// Update agent status display
function updateAgentStatus(state: string) {
  agentSessionState = state as "idle" | "working" | "stopped"
  const statusDot = agentStatus.querySelector(".status-dot")
  const statusText = agentStatus.querySelector(".status-text")

  if (statusDot && statusText) {
    statusDot.className = `status-dot ${state}`
    statusText.textContent = state.charAt(0).toUpperCase() + state.slice(1)
  }

  // Update UI based on state
  if (state === "stopped") {
    startSessionBtn.classList.remove("hidden")
    stopSessionBtn.classList.add("hidden")
    agentActions.classList.add("hidden")
    agentCommand.classList.add("hidden")
  } else {
    startSessionBtn.classList.add("hidden")
    stopSessionBtn.classList.remove("hidden")
    agentActions.classList.remove("hidden")
    agentCommand.classList.remove("hidden")
  }

  fillFormBtn.disabled = state !== "idle" || !selectedJobMatchId
}

// Start agent session
async function startAgentSession() {
  const provider = agentProviderSelect.value as "claude" | "codex" | "gemini"

  startSessionBtn.disabled = true
  setStatus("Starting agent session...", "loading")
  agentOutput.innerHTML = '<div class="loading-placeholder">Starting session...</div>'

  // Subscribe to events
  unsubscribeAgentOutput = api.onAgentOutput((data) => {
    appendAgentOutput(data.text)
  })
  unsubscribeAgentStatus = api.onAgentStatus((data) => {
    updateAgentStatus(data.state)
  })

  const result = await api.agentStartSession({ provider })

  if (result.success) {
    setStatus("Agent session started", "success")
    updateAgentStatus("idle")
  } else {
    setStatus(result.message || "Failed to start session", "error")
    startSessionBtn.disabled = false
    cleanupAgentListeners()
  }
}

// Stop agent session
async function stopAgentSession() {
  setStatus("Stopping agent session...", "loading")

  await api.agentStopSession()

  cleanupAgentListeners()
  updateAgentStatus("stopped")
  setStatus("Agent session stopped", "success")
  agentOutput.innerHTML = '<div class="empty-placeholder">Session ended</div>'
}

// Send command to agent
async function sendAgentCommand() {
  const command = agentCommandInput.value.trim()
  if (!command) return

  agentCommandInput.value = ""
  appendAgentOutput(`> ${command}\n`, "command")

  const result = await api.agentSendCommand(command)

  if (!result.success) {
    appendAgentOutput(`Error: ${result.message}\n`, "error")
  }
}

// Fill form with agent
async function fillFormWithAgent() {
  if (!selectedJobMatchId) {
    setStatus("Select a job first", "error")
    return
  }

  const match = jobMatches.find((m) => m.id === selectedJobMatchId)
  if (!match) return

  // Build job context
  const jobContext = [
    `Job: ${match.listing.title} at ${match.listing.companyName}`,
    match.listing.location ? `Location: ${match.listing.location}` : "",
    match.listing.description ? `Description: ${match.listing.description.slice(0, 500)}` : "",
  ].filter(Boolean).join("\n")

  setStatus("Filling form...", "loading")
  setWorkflowStep("fill", "active")

  const result = await api.agentFillForm({
    jobMatchId: selectedJobMatchId,
    jobContext,
  })

  if (result.success) {
    setStatus("Form fill started", "success")
  } else {
    setStatus(result.message || "Fill failed", "error")
  }
}

// Append text to agent output
function appendAgentOutput(text: string, type?: "command" | "error" | "tool") {
  // Remove placeholder if present
  const placeholder = agentOutput.querySelector(".empty-placeholder, .loading-placeholder")
  if (placeholder) {
    agentOutput.innerHTML = ""
  }

  const span = document.createElement("span")
  if (type === "command") {
    span.className = "agent-command-line"
  } else if (type === "error") {
    span.className = "agent-error"
  } else if (type === "tool") {
    span.className = "tool-call"
  }
  span.textContent = text
  agentOutput.appendChild(span)

  // Auto-scroll to bottom
  agentOutput.scrollTop = agentOutput.scrollHeight
}

// Cleanup agent event listeners
function cleanupAgentListeners() {
  if (unsubscribeAgentOutput) {
    unsubscribeAgentOutput()
    unsubscribeAgentOutput = null
  }
  if (unsubscribeAgentStatus) {
    unsubscribeAgentStatus()
    unsubscribeAgentStatus = null
  }
}
```

**Add event listeners in initializeApp():**
```typescript
// Agent session event listeners
startSessionBtn.addEventListener("click", startAgentSession)
stopSessionBtn.addEventListener("click", stopAgentSession)
fillFormBtn.addEventListener("click", fillFormWithAgent)
sendCommandBtn.addEventListener("click", sendAgentCommand)
agentCommandInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendAgentCommand()
})
```

**Update cleanup on unload:**
```typescript
window.addEventListener("beforeunload", () => {
  cleanupGenerationProgressListener()
  cleanupAgentListeners()
})
```

---

## File-by-File Changes

### Summary Table

| File | Action | Lines Changed |
|------|--------|---------------|
| package.json | MODIFY | +1 dependency |
| src/main.ts | MODIFY | -560, +80 |
| src/types.ts | MODIFY | -42 |
| src/preload.ts | MODIFY | -10, +30 |
| src/utils.ts | MODIFY | +15 |
| src/agent-session.ts | CREATE | +200 |
| src/agent-tools.ts | CREATE | +350 |
| src/renderer/index.html | MODIFY | -14, +30 |
| src/renderer/styles.css | MODIFY | +80 |
| src/renderer/app.ts | MODIFY | -120, +180 |

### Detailed Changes

#### package.json
```diff
  "dependencies": {
    "@shared/types": "*",
+   "node-pty": "^0.10.1",
    "playwright-core": "^1.47.2"
  },
```

#### src/main.ts

**Remove:**
- Lines 103-109: AGENT_* constants
- Lines 831-1350: Vision agent functions
- Lines 1360-1392: agent-fill IPC handler

**Add:**
- Import agent-session and agent-tools
- Call setBrowserView() in createWindow()
- New IPC handlers for agent session

#### src/types.ts

**Remove lines 79-120:**
- AgentActionKind
- AgentAction
- AgentActionResult
- AgentProgress
- AgentSummary

**Add:**
```typescript
// Agent Session Types
export type AgentSessionState = "idle" | "working" | "stopped"
```

#### src/preload.ts

**Remove:**
- agentFill method
- onAgentProgress method

**Add:**
- agentStartSession, agentStopSession, agentSendCommand, agentFillForm, agentGetStatus
- onAgentOutput, onAgentStatus

#### src/utils.ts

**Add withTimeout function** (moved from main.ts):
```typescript
export function withTimeout<T>(promise: Promise<T>, ms: number, errorMsg: string): Promise<T>
```

---

## Testing Strategy

### Unit Tests
1. **agent-session.ts**
   - Tool call parsing from buffer
   - State machine transitions
   - Event emission

2. **agent-tools.ts**
   - Each tool handler in isolation
   - Coordinate scaling
   - Error handling

### Integration Tests
1. **Session lifecycle**
   - Start → Fill → Stop
   - Restart after stop
   - Handle PTY crash

2. **Tool execution**
   - Screenshot capture
   - Click at coordinates
   - Type text
   - Document generation

### Manual Testing
1. Start session, verify status indicator
2. Navigate to job form
3. Click "Fill Form"
4. Verify agent requests screenshot
5. Verify form fields populated
6. Send custom command
7. Stop session

---

## Rollback Plan

If issues arise:

1. **Git revert**: All changes are atomic, can revert entire PR
2. **Keep node-pty**: Removing dependency requires rebuild
3. **Restore legacy files**: Vision agent code saved in git history

---

## Open Questions (Resolved)

1. ~~How to handle multi-page forms?~~ → Agent handles via navigation detection
2. ~~Auto-detect form completion?~~ → Agent calls done() explicitly
3. ~~CAPTCHA handling?~~ → Agent reports blocked, user intervenes
4. ~~Session persistence?~~ → Not for MVP

---

## Critical Implementation Notes

### 1. Tool Protocol Robustness

The tool parsing in `agent-session.ts` uses string matching for `<tool>` and `</tool>` delimiters. Edge cases to handle:

- **Incomplete tool calls**: Buffer may receive partial JSON - wait for complete message
- **Malformed JSON**: Log error but don't crash session
- **Multiple tool calls**: Agent may emit multiple `<tool>` blocks in one response

### 2. State Machine Integrity

Ensure state transitions are valid:
```
stopped → idle (on start)
idle → working (on command/fill)
working → idle (on done tool or timeout)
working → stopped (on error or user stop)
idle → stopped (on user stop)
```

### 3. BrowserView Reference

The `setBrowserView()` function must be called in `createWindow()` after BrowserView is created:
```typescript
browserView = new BrowserView({ ... })
mainWindow.setBrowserView(browserView)
setBrowserView(browserView) // Add this line
```

And cleared on window close:
```typescript
mainWindow.on("closed", () => {
  mainWindow = null
  browserView = null
  setBrowserView(null) // Add this line
})
```

### 4. Logging Strategy

All significant events should be logged for debugging:
- Session start/stop
- Tool calls (name + params summary)
- Tool results (success/failure)
- State changes
- Errors with stack traces

Example log format:
```
[AgentSession] Session started with provider: claude
[AgentSession] Tool call: screenshot
[AgentTools] Executing: screenshot
[AgentTools] screenshot completed (1280x720, hash: abc123...)
[AgentSession] Sent tool result: true
[AgentSession] State change: working → idle
```

### 5. Error Recovery

If PTY crashes:
1. Log error with full details
2. Emit "error" event to renderer
3. Set state to "stopped"
4. Clean up resources
5. User must manually restart session

Do NOT auto-restart - user should know session ended.

### 6. Memory Management

- Clean up event listeners when session stops
- Clear output buffer periodically (cap at ~100KB)
- Remove IPC listeners when window closes

---

## Appendix: Code to Copy

### capturePage (from main.ts:838-860)
Copy to agent-tools.ts, rename to handleScreenshot()

### executeActionInternal (from main.ts:901-1077)
Split into individual tool handlers in agent-tools.ts

### Coordinate scaling logic
Reuse in handleClick(), same formula:
```typescript
const scale = bounds.width > SCREENSHOT_WIDTH ? bounds.width / SCREENSHOT_WIDTH : 1
const scaledX = Math.round(x * scale)
const scaledY = Math.round(y * scale)
```
