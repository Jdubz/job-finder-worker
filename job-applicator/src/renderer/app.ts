import type {
  JobMatchWithListing as JobMatchListItem,
  DocumentInfo,
  GenerationProgress,
  GenerationStep,
  WorkflowState,
  WorkflowStep,
  AgentSessionState,
  AgentOutputData,
  AgentStatusData,
} from "../types.js"
import type { ResumeContent, CoverLetterContent, DraftContentResponse } from "@shared/types"

// ============================================================================
// Agent Output Parser (inlined to avoid ES module issues in renderer)
// ============================================================================

interface ParsedActivity {
  type: "tool_call" | "tool_result" | "thinking" | "text" | "error" | "completion"
  tool?: string
  params?: Record<string, unknown>
  result?: unknown
  text?: string
  icon?: string
  displayText: string
}

// Tool display configuration
const TOOL_DISPLAY: Record<string, { icon: string; verb: string }> = {
  screenshot: { icon: "📸", verb: "Taking screenshot" },
  click: { icon: "🖱️", verb: "Clicking" },
  type: { icon: "⌨️", verb: "Typing" },
  press_key: { icon: "⌨️", verb: "Pressing key" },
  scroll: { icon: "📜", verb: "Scrolling" },
  get_form_fields: { icon: "📋", verb: "Analyzing form fields" },
  generate_resume: { icon: "📄", verb: "Generating resume" },
  generate_cover_letter: { icon: "📝", verb: "Generating cover letter" },
  upload_file: { icon: "📤", verb: "Uploading file" },
  done: { icon: "✅", verb: "Completed" },
}

// Patterns for parsing CLI output
const PARSE_PATTERNS = {
  toolCallLine: /\[tool:\s*(\w+)\]/i,
  usingTool: /using\s+(?:tool|mcp\s+tool):\s*(\w+)/i,
  mcpToolCall: /calling\s+(?:mcp\s+)?tool\s+['"]?(\w+)['"]?/i,
  completion: /(?:form\s+fill(?:ing)?\s+)?(?:completed?|finished|done)/i,
  screenshotTaken: /screenshot\s+(?:taken|captured)/i,
  clickingAt: /click(?:ing|ed)?\s+(?:at\s+)?\(?(\d+)\s*,\s*(\d+)\)?/i,
  typingText: /typ(?:ing|ed?)\s+(?:text\s+)?['"]?([^'"]+)['"]?/i,
  analyzing: /(?:analyzing|examining|looking\s+at|checking|reviewing)/i,
  toolError: /tool\s+(?:result|output).*(?:error|failed)/i,
}

function formatToolCall(toolName: string, params?: Record<string, unknown>): string {
  const display = TOOL_DISPLAY[toolName] || { icon: "🔧", verb: "Using" }

  switch (toolName) {
    case "screenshot":
      return `${display.icon} Taking screenshot...`
    case "click":
      if (params?.x !== undefined && params?.y !== undefined) {
        return `${display.icon} Clicking at (${params.x}, ${params.y})`
      }
      return `${display.icon} Clicking...`
    case "type":
      if (params?.text) {
        const text = String(params.text)
        const preview = text.length > 30 ? text.slice(0, 30) + "..." : text
        return `${display.icon} Typing "${preview}"`
      }
      return `${display.icon} Typing...`
    case "press_key":
      if (params?.key) {
        return `${display.icon} Pressing ${params.key}`
      }
      return `${display.icon} Pressing key...`
    case "scroll":
      if (params?.dy !== undefined) {
        const direction = Number(params.dy) > 0 ? "down" : "up"
        return `${display.icon} Scrolling ${direction}`
      }
      return `${display.icon} Scrolling...`
    case "get_form_fields":
      return `${display.icon} Analyzing form fields...`
    case "generate_resume":
      return `${display.icon} Generating tailored resume...`
    case "generate_cover_letter":
      return `${display.icon} Generating cover letter...`
    case "upload_file":
      if (params?.type) {
        const fileType = params.type === "coverLetter" ? "cover letter" : "resume"
        return `${display.icon} Uploading ${fileType}...`
      }
      return `${display.icon} Uploading file...`
    case "done":
      if (params?.summary) {
        return `${display.icon} ${params.summary}`
      }
      return `${display.icon} Form filling completed`
    default:
      return `${display.icon} ${display.verb} ${toolName}...`
  }
}

function parseLine(line: string): ParsedActivity | null {
  // Try to parse as JSON tool call
  try {
    if (line.includes('"type"') && line.includes('"tool_use"')) {
      const match = line.match(/\{[^{}]*"type"\s*:\s*"tool_use"[^{}]*\}/)
      if (match) {
        const json = JSON.parse(match[0])
        const toolName = json.name || "unknown"
        const display = TOOL_DISPLAY[toolName] || { icon: "🔧", verb: "Using" }
        return {
          type: "tool_call",
          tool: toolName,
          params: json.input,
          icon: display.icon,
          displayText: formatToolCall(toolName, json.input),
        }
      }
    }
  } catch {
    // Not valid JSON, continue with other patterns
  }

  // Check for tool call patterns
  const toolMatch = line.match(PARSE_PATTERNS.toolCallLine)
    || line.match(PARSE_PATTERNS.usingTool)
    || line.match(PARSE_PATTERNS.mcpToolCall)

  if (toolMatch) {
    const toolName = toolMatch[1].toLowerCase()
    const display = TOOL_DISPLAY[toolName] || { icon: "🔧", verb: "Using" }
    return {
      type: "tool_call",
      tool: toolName,
      icon: display.icon,
      displayText: `${display.icon} ${display.verb}...`,
    }
  }

  // Check for completion
  if (PARSE_PATTERNS.completion.test(line)) {
    return { type: "completion", icon: "✅", displayText: `✅ ${line}` }
  }

  // Check for screenshot taken
  if (PARSE_PATTERNS.screenshotTaken.test(line)) {
    return { type: "tool_result", tool: "screenshot", icon: "📸", displayText: "📸 Screenshot captured" }
  }

  // Check for click action
  const clickMatch = line.match(PARSE_PATTERNS.clickingAt)
  if (clickMatch) {
    return { type: "tool_call", tool: "click", icon: "🖱️", displayText: `🖱️ Clicking at (${clickMatch[1]}, ${clickMatch[2]})` }
  }

  // Check for typing
  const typeMatch = line.match(PARSE_PATTERNS.typingText)
  if (typeMatch) {
    const text = typeMatch[1].length > 30 ? typeMatch[1].slice(0, 30) + "..." : typeMatch[1]
    return { type: "tool_call", tool: "type", icon: "⌨️", displayText: `⌨️ Typing "${text}"` }
  }

  // Check for analyzing/thinking
  if (PARSE_PATTERNS.analyzing.test(line)) {
    return { type: "thinking", icon: "🤔", displayText: `🤔 ${line}` }
  }

  // Check for errors
  if (PARSE_PATTERNS.toolError.test(line) || line.toLowerCase().includes("error")) {
    return { type: "error", icon: "❌", displayText: `❌ ${line}` }
  }

  // Default: return as text if it looks meaningful
  if (line.length > 5) {
    return { type: "text", displayText: line }
  }

  return null
}

function parseAgentOutput(text: string): ParsedActivity[] {
  const activities: ParsedActivity[] = []
  const lines = text.split("\n")

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const activity = parseLine(trimmed)
    if (activity) activities.push(activity)
  }

  if (activities.length === 0 && text.trim()) {
    activities.push({ type: "text", displayText: text.trim() })
  }

  return activities
}

class StreamingParser {
  private buffer: string = ""
  private lastToolCall: string | null = null

  addChunk(chunk: string): ParsedActivity[] {
    this.buffer += chunk
    const activities: ParsedActivity[] = []
    const lines = this.buffer.split("\n")
    this.buffer = lines.pop() || ""

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      const activity = parseLine(trimmed)
      if (activity) {
        if (activity.type === "tool_call" && activity.tool === this.lastToolCall) continue
        if (activity.type === "tool_call") this.lastToolCall = activity.tool || null
        activities.push(activity)
      }
    }
    return activities
  }

  flush(): ParsedActivity[] {
    if (!this.buffer.trim()) return []
    const activities = parseAgentOutput(this.buffer)
    this.buffer = ""
    return activities
  }

  reset(): void {
    this.buffer = ""
    this.lastToolCall = null
  }
}

// ============================================================================
// End Agent Output Parser
// ============================================================================

interface ElectronAPI {
  // Logging - forwards to main process (logs to both console and file)
  log: {
    info: (...args: unknown[]) => void
    warn: (...args: unknown[]) => void
    error: (...args: unknown[]) => void
    debug: (...args: unknown[]) => void
  }

  // Authentication
  auth: {
    login: () => Promise<{ success: boolean; user?: { email: string; name?: string }; message?: string }>
    logout: () => Promise<{ success: boolean }>
    getUser: () => Promise<{ authenticated: boolean; user?: { email: string; name?: string } }>
  }

  navigate: (url: string) => Promise<{ success: boolean; message?: string }>
  getUrl: () => Promise<string>
  goBack: () => Promise<{ success: boolean; canGoBack: boolean; message?: string }>
  getNavigationState: () => Promise<{ url: string; canGoBack: boolean }>

  // BrowserView control (for modal overlays)
  hideBrowserView: () => Promise<{ success: boolean }>
  showBrowserView: () => Promise<{ success: boolean }>

  // Form Fill API (MCP-based)
  fillForm: (options: { jobMatchId: string; jobContext: string; resumeUrl?: string; coverLetterUrl?: string }) => Promise<{ success: boolean; message?: string }>
  stopFillForm: () => Promise<{ success: boolean }>
  sendAgentInput: (input: string) => Promise<{ success: boolean; message?: string }>
  pauseAgent: () => Promise<{ success: boolean; message?: string }>
  onAgentOutput: (callback: (data: AgentOutputData) => void) => () => void
  onAgentStatus: (callback: (data: AgentStatusData) => void) => () => void
  onBrowserUrlChanged: (callback: (data: { url: string }) => void) => () => void

  // File upload
  uploadResume: (options?: {
    documentUrl?: string
    type?: "resume" | "coverLetter"
  }) => Promise<{ success: boolean; message: string; filePath?: string }>
  submitJob: (provider: "gemini") => Promise<{ success: boolean; message: string }>
  getCdpStatus: () => Promise<{ connected: boolean; message?: string }>
  checkFileInput: () => Promise<{ hasFileInput: boolean; selector?: string }>

  // Job matches
  getJobMatches: (options?: { limit?: number; status?: string }) => Promise<{
    success: boolean
    data?: JobMatchListItem[]
    message?: string
  }>
  getJobMatch: (id: string) => Promise<{ success: boolean; data?: unknown; message?: string }>
  findJobMatchByUrl: (url: string) => Promise<{ success: boolean; data?: JobMatchListItem | null; message?: string }>
  updateJobMatchStatus: (options: {
    id: string
    status: "active" | "ignored" | "applied"
  }) => Promise<{ success: boolean; message?: string }>

  // Documents
  getDocuments: (jobMatchId: string) => Promise<{
    success: boolean
    data?: DocumentInfo[]
    message?: string
  }>
  openDocument: (documentPath: string) => Promise<{ success: boolean; message?: string }>
  startGeneration: (options: {
    jobMatchId: string
    type: "resume" | "coverLetter" | "both"
  }) => Promise<{ success: boolean; requestId?: string; message?: string }>
  runGeneration: (options: {
    jobMatchId: string
    type: "resume" | "coverLetter" | "both"
  }) => Promise<{ success: boolean; data?: GenerationProgress; message?: string }>
  onGenerationProgress: (callback: (progress: GenerationProgress) => void) => () => void
  onGenerationAwaitingReview: (callback: (progress: GenerationProgress) => void) => () => void
  fetchDraftContent: (requestId: string) => Promise<{ success: boolean; data?: DraftContentResponse; message?: string }>
  submitDocumentReview: (options: {
    requestId: string
    documentType: "resume" | "coverLetter"
    content: ResumeContent | CoverLetterContent
  }) => Promise<{ success: boolean; data?: GenerationProgress; message?: string }>
  onRefreshJobMatches: (callback: () => void) => () => void
}

// Extend Window interface - with safety check for missing preload
declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

// Logger utility - uses IPC to forward logs to main process (logs to file + console)
// Falls back to console if API not yet available (during early init)
const log = {
  info: (...args: unknown[]) => {
    const formatted = args.map(a => typeof a === "object" ? JSON.stringify(a) : String(a)).join(" ")
    if (window.electronAPI?.log) {
      window.electronAPI.log.info("[RENDERER]", formatted)
    } else {
      console.log("[RENDERER:info]", formatted)
    }
  },
  warn: (...args: unknown[]) => {
    const formatted = args.map(a => typeof a === "object" ? JSON.stringify(a) : String(a)).join(" ")
    if (window.electronAPI?.log) {
      window.electronAPI.log.warn("[RENDERER]", formatted)
    } else {
      console.warn("[RENDERER:warn]", formatted)
    }
  },
  error: (...args: unknown[]) => {
    const formatted = args.map(a => typeof a === "object" ? JSON.stringify(a) : String(a)).join(" ")
    if (window.electronAPI?.log) {
      window.electronAPI.log.error("[RENDERER]", formatted)
    } else {
      console.error("[RENDERER:error]", formatted)
    }
  },
  debug: (...args: unknown[]) => {
    const formatted = args.map(a => typeof a === "object" ? JSON.stringify(a) : String(a)).join(" ")
    if (window.electronAPI?.log) {
      window.electronAPI.log.debug("[RENDERER]", formatted)
    } else {
      console.log("[RENDERER:debug]", formatted)
    }
  },
}

// Debug: log immediately when script loads
log.info("Script loaded")

log.debug("Checking for electronAPI...")
if (!window.electronAPI) {
  log.error("electronAPI not found!")
  throw new Error("Electron API not available. Preload script may have failed to load.")
}
log.info("electronAPI found")
const api = window.electronAPI

// State
let _currentUser: { email: string; name?: string } | null = null
let selectedJobMatchId: string | null = null
let selectedResumeId: string | null = null
let selectedCoverLetterId: string | null = null
let jobMatches: JobMatchListItem[] = []
let documents: DocumentInfo[] = []
const workflowState: WorkflowState = {
  job: "pending",
  docs: "pending",
  fill: "pending",
  submit: "pending",
}
let unsubscribeGenerationProgress: (() => void) | null = null
let unsubscribeGenerationReview: (() => void) | null = null
let isGenerating = false // Prevent concurrent document generations
let hasFileInput = false // Whether current page has a file input element
let currentReviewRequestId: string | null = null // Request ID when in review mode
let currentReviewDocumentType: "resume" | "coverLetter" | null = null // Document type being reviewed
let currentReviewContent: ResumeContent | CoverLetterContent | null = null // Content being reviewed

// Helper to get DOM element with null check
function getElement<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id)
  if (!el) {
    throw new Error(`Required DOM element not found: #${id}`)
  }
  return el as T
}

// DOM elements - Auth
const authUser = getElement<HTMLDivElement>("authUser")
const authLogin = getElement<HTMLDivElement>("authLogin")
const userEmail = getElement<HTMLSpanElement>("userEmail")
const loginBtn = getElement<HTMLButtonElement>("loginBtn")
const logoutBtn = getElement<HTMLButtonElement>("logoutBtn")

// DOM elements - Toolbar
const backBtn = getElement<HTMLButtonElement>("backBtn")
const urlInput = getElement<HTMLInputElement>("urlInput")
const goBtn = getElement<HTMLButtonElement>("goBtn")
const submitJobBtn = getElement<HTMLButtonElement>("submitJobBtn")
const statusEl = getElement<HTMLSpanElement>("status")

// DOM elements - Sidebar
const jobSelect = getElement<HTMLSelectElement>("jobSelect")
const resumeSelect = getElement<HTMLSelectElement>("resumeSelect")
const coverLetterSelect = getElement<HTMLSelectElement>("coverLetterSelect")
const generateBtn = getElement<HTMLButtonElement>("generateBtn")
const generateTypeSelect = getElement<HTMLSelectElement>("generateType")
const jobActionsSection = getElement<HTMLDivElement>("jobActionsSection")
const markAppliedBtn = getElement<HTMLButtonElement>("markAppliedBtn")
const markIgnoredBtn = getElement<HTMLButtonElement>("markIgnoredBtn")
const workflowProgress = getElement<HTMLDivElement>("workflowProgress")
const generationProgress = getElement<HTMLDivElement>("generationProgress")
const generationSteps = getElement<HTMLDivElement>("generationSteps")
const reviewModalOverlay = getElement<HTMLDivElement>("reviewModalOverlay")
const reviewTitle = getElement<HTMLHeadingElement>("reviewTitle")
const reviewContent = getElement<HTMLDivElement>("reviewContent")
const approveReviewBtn = getElement<HTMLButtonElement>("approveReviewBtn")
const cancelReviewBtn = getElement<HTMLButtonElement>("cancelReviewBtn")

// DOM elements - Agent Panel
const agentStatus = getElement<HTMLDivElement>("agentStatus")
const startSessionBtn = getElement<HTMLButtonElement>("startSessionBtn")
const stopSessionBtn = getElement<HTMLButtonElement>("stopSessionBtn")
const agentActions = getElement<HTMLDivElement>("agentActions")
const fillFormBtn = getElement<HTMLButtonElement>("fillFormBtn")
const agentOutput = getElement<HTMLDivElement>("agentOutput")

// DOM elements - Upload section
const uploadResumeBtn = getElement<HTMLButtonElement>("uploadResumeBtn")
const uploadCoverBtn = getElement<HTMLButtonElement>("uploadCoverBtn")
const uploadStatusText = getElement<HTMLSpanElement>("uploadStatusText")
const uploadStatus = getElement<HTMLDivElement>("uploadStatus")
const rescanBtn = getElement<HTMLButtonElement>("rescanBtn")
const refreshJobsBtn = getElement<HTMLButtonElement>("refreshJobsBtn")
const previewResumeBtn = getElement<HTMLButtonElement>("previewResumeBtn")
const previewCoverLetterBtn = getElement<HTMLButtonElement>("previewCoverLetterBtn")

function setStatus(message: string, type: "success" | "error" | "loading" | "" = "") {
  statusEl.textContent = message
  statusEl.className = "status" + (type ? ` ${type}` : "")
}

function setButtonsEnabled(enabled: boolean) {
  goBtn.disabled = !enabled
  submitJobBtn.disabled = !enabled
  // Upload buttons have their own enable logic based on file input and document selection
  updateUploadButtonsState()
}

async function refreshNavigationState() {
  try {
    const state = await api.getNavigationState()
    if (state.url) {
      urlInput.value = state.url
    }
    backBtn.disabled = !state.canGoBack
  } catch (err) {
    log.warn("Failed to refresh navigation state:", err)
    backBtn.disabled = true
  }
}

// Update workflow progress UI
function updateWorkflowProgress() {
  const steps: WorkflowStep[] = ["job", "docs", "fill", "submit"]
  steps.forEach((step) => {
    const stepEl = workflowProgress.querySelector(`[data-step="${step}"]`)
    if (stepEl) {
      stepEl.classList.remove("pending", "active", "completed")
      stepEl.classList.add(workflowState[step])
    }
    // Update screen reader status text
    const statusEl = document.getElementById(`${step}-status`)
    if (statusEl) {
      statusEl.textContent = workflowState[step]
    }
  })
}

// Set workflow step state
function setWorkflowStep(step: WorkflowStep, state: "pending" | "active" | "completed") {
  workflowState[step] = state
  updateWorkflowProgress()
}


// ============================================================================
// Authentication
// ============================================================================

// Update auth UI based on state
function updateAuthUI(user: { email: string; name?: string } | null) {
  _currentUser = user
  if (user) {
    authUser.classList.remove("hidden")
    authLogin.classList.add("hidden")
    userEmail.textContent = user.name || user.email
    setStatus(`Signed in as ${user.email}`, "success")
  } else {
    authUser.classList.add("hidden")
    authLogin.classList.remove("hidden")
    setStatus("Sign in to continue", "")
  }
}

// Login handler
async function handleLogin() {
  loginBtn.disabled = true
  setStatus("Signing in...", "loading")

  try {
    const result = await api.auth.login()
    if (result.success && result.user) {
      updateAuthUI(result.user)
      // Load job matches after successful login
      await loadJobMatches()
    } else {
      setStatus(result.message || "Login failed", "error")
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    setStatus(`Login failed: ${message}`, "error")
  } finally {
    loginBtn.disabled = false
  }
}

// Logout handler
async function handleLogout() {
  logoutBtn.disabled = true
  setStatus("Signing out...", "loading")

  try {
    await api.auth.logout()
    updateAuthUI(null)
    // Clear job matches on logout
    jobMatches = []
    renderJobSelect()
  } catch (err) {
    // Log error but still clear local state (user is effectively logged out locally)
    const message = err instanceof Error ? err.message : String(err)
    log.error("Logout API call failed:", message)
    // Still update UI to logged out state
    updateAuthUI(null)
    jobMatches = []
    renderJobSelect()
  } finally {
    logoutBtn.disabled = false
  }
}

// ============================================================================
// Job Matches
// ============================================================================

// Load job matches from backend
// Returns true on success, false on failure
async function loadJobMatches(): Promise<boolean> {
  jobSelect.disabled = true
  jobSelect.innerHTML = '<option value="">Loading...</option>'

  try {
    const result = await api.getJobMatches({ limit: 50, status: "active" })

    if (result.success && Array.isArray(result.data)) {
      jobMatches = result.data
      renderJobSelect()
      return true
    } else {
      jobMatches = []
      jobSelect.innerHTML = `<option value="">${result.message || "Failed to load"}</option>`
      return false
    }
  } catch (err) {
    jobMatches = []
    const message = err instanceof Error ? err.message : String(err)
    jobSelect.innerHTML = `<option value="">Error: ${message}</option>`
    log.error("Failed to load job matches:", err)
    return false
  }
}

// Refresh job matches with visual feedback
async function refreshJobMatches() {
  // Add spinning animation to refresh button
  refreshJobsBtn.classList.add("refreshing")
  refreshJobsBtn.disabled = true
  setStatus("Refreshing job matches...", "loading")

  const success = await loadJobMatches()
  if (success) {
    setStatus(`Loaded ${jobMatches.length} job matches`, "success")
  } else {
    setStatus("Failed to refresh job matches", "error")
  }

  refreshJobsBtn.classList.remove("refreshing")
  refreshJobsBtn.disabled = false
}

// Render job matches dropdown
function renderJobSelect() {
  if (jobMatches.length === 0) {
    jobSelect.innerHTML = '<option value="">No job matches found</option>'
    jobSelect.disabled = true
    return
  }

  jobSelect.innerHTML = '<option value="">-- Select Job --</option>' +
    jobMatches.map((match) => {
      const statusSuffix = match.status !== "active" ? ` [${match.status}]` : ""
      const label = `${match.listing.title} @ ${match.listing.companyName} (${match.matchScore}%)${statusSuffix}`
      return `<option value="${escapeAttr(match.id ?? "")}">${escapeHtml(label)}</option>`
    }).join("")

  // Preserve selection if still valid
  if (selectedJobMatchId && jobMatches.find((m) => m.id === selectedJobMatchId)) {
    jobSelect.value = selectedJobMatchId
  }

  jobSelect.disabled = false
}

// Select a job match
async function selectJobMatch(id: string) {
  selectedJobMatchId = id
  selectedResumeId = null
  selectedCoverLetterId = null

  // Update dropdown selection
  jobSelect.value = id

  // Update fill button state (depends on selectedJobMatchId)
  updateAgentStatusUI(_agentSessionState)

  // Find the match
  const match = jobMatches.find((m) => m.id === id)
  if (!match) return

  // Update workflow state - job step is now completed
  setWorkflowStep("job", "completed")
  setWorkflowStep("docs", "active")

  // Show job actions section
  jobActionsSection.classList.remove("hidden")

  // Update button states based on match status
  markAppliedBtn.disabled = match.status === "applied"
  markIgnoredBtn.disabled = match.status === "ignored"

  // Load the job URL in BrowserView
  setStatus("Loading job listing...", "loading")
  // Note: navigate always returns {success, message?, aborted?} but we use optional chaining
  // as defensive programming for the IPC boundary edge cases
  const navResult = await api.navigate(match.listing.url)
  if (navResult.success) {
    urlInput.value = match.listing.url
    setStatus("Job listing loaded", "success")
  } else {
    setStatus(navResult.message || "Failed to load job listing", "error")
  }

  // Load documents for this job match
  await loadDocuments(id)

  // Enable generate button
  generateBtn.disabled = false
}

// Load documents for a job match
// If autoSelectId is provided, auto-select that document in the appropriate dropdown
async function loadDocuments(jobMatchId: string, autoSelectId?: string) {
  // Disable dropdowns while loading
  resumeSelect.disabled = true
  coverLetterSelect.disabled = true

  try {
    const result = await api.getDocuments(jobMatchId)

    if (result.success && Array.isArray(result.data)) {
      documents = result.data

      // Filter documents with resume and cover letter URLs
      // Note: Don't filter by status - documents with URLs are selectable regardless of workflow state
      const resumes = documents.filter((d) => d.resumeUrl)
      const coverLetters = documents.filter((d) => d.coverLetterUrl)

      // Populate resume dropdown with date + ID snippet
      resumeSelect.innerHTML = '<option value="">-- Select Resume --</option>' +
        resumes.map((doc) => {
          const date = new Date(doc.createdAt).toLocaleDateString()
          const idSnippet = doc.id.slice(0, 6)
          return `<option value="${escapeAttr(doc.id)}">${escapeHtml(date)} (${escapeHtml(idSnippet)})</option>`
        }).join("")

      // Populate cover letter dropdown with date + ID snippet
      coverLetterSelect.innerHTML = '<option value="">-- Select Cover Letter --</option>' +
        coverLetters.map((doc) => {
          const date = new Date(doc.createdAt).toLocaleDateString()
          const idSnippet = doc.id.slice(0, 6)
          return `<option value="${escapeAttr(doc.id)}">${escapeHtml(date)} (${escapeHtml(idSnippet)})</option>`
        }).join("")

      // Auto-select logic
      if (autoSelectId) {
        const doc = documents.find((d) => d.id === autoSelectId)
        if (doc?.resumeUrl) selectedResumeId = doc.id
        if (doc?.coverLetterUrl) selectedCoverLetterId = doc.id
      } else {
        // Auto-select most recent if not already selected
        if (!selectedResumeId && resumes.length > 0) {
          selectedResumeId = resumes[0].id
        }
        if (!selectedCoverLetterId && coverLetters.length > 0) {
          selectedCoverLetterId = coverLetters[0].id
        }
      }

      // Set dropdown values
      resumeSelect.value = selectedResumeId || ""
      coverLetterSelect.value = selectedCoverLetterId || ""

      // Enable dropdowns if they have options
      resumeSelect.disabled = resumes.length === 0
      coverLetterSelect.disabled = coverLetters.length === 0

      updateUploadButtonsState()
    } else {
      documents = []
      selectedResumeId = null
      selectedCoverLetterId = null
      resumeSelect.innerHTML = '<option value="">-- No resumes --</option>'
      coverLetterSelect.innerHTML = '<option value="">-- No cover letters --</option>'
      updateUploadButtonsState()
    }
  } catch (err) {
    documents = []
    selectedResumeId = null
    selectedCoverLetterId = null
    const message = err instanceof Error ? err.message : String(err)
    log.error("Failed to load documents:", message)
    resumeSelect.innerHTML = '<option value="">-- Error loading --</option>'
    coverLetterSelect.innerHTML = '<option value="">-- Error loading --</option>'
    updateUploadButtonsState()
  }
}

// Get the selected resume document
function getSelectedResume(): DocumentInfo | null {
  if (!selectedResumeId) return null
  return documents.find((d) => d.id === selectedResumeId) || null
}

// Get the selected cover letter document
function getSelectedCoverLetter(): DocumentInfo | null {
  if (!selectedCoverLetterId) return null
  return documents.find((d) => d.id === selectedCoverLetterId) || null
}

// Get selected document by type (prefixed with _ as currently unused but may be needed)
function _getSelectedDocumentByType(type: "resume" | "coverLetter"): DocumentInfo | null {
  const id = type === "resume" ? selectedResumeId : selectedCoverLetterId
  if (!id) return null
  return documents.find((d) => d.id === id) || null
}

// Update upload buttons and preview buttons enabled state based on requirements:
// Upload: 1. File input must exist on page 2. A document must be selected for that type
// Preview: Document must be selected
function updateUploadButtonsState() {
  const resumeDoc = getSelectedResume()
  const coverLetterDoc = getSelectedCoverLetter()
  const canUploadResume = hasFileInput && resumeDoc?.resumeUrl
  const canUploadCover = hasFileInput && coverLetterDoc?.coverLetterUrl

  uploadResumeBtn.disabled = !canUploadResume
  uploadCoverBtn.disabled = !canUploadCover

  // Preview buttons only need a document selected
  previewResumeBtn.disabled = !resumeDoc?.resumeUrl
  previewCoverLetterBtn.disabled = !coverLetterDoc?.coverLetterUrl

  // Update status message
  if (!hasFileInput) {
    uploadStatus.className = "upload-status warning"
    uploadStatusText.textContent = "No file input detected on page"
  } else {
    const ready: string[] = []
    if (resumeDoc?.resumeUrl) ready.push("Resume")
    if (coverLetterDoc?.coverLetterUrl) ready.push("Cover Letter")
    if (ready.length > 0) {
      uploadStatus.className = "upload-status ready"
      uploadStatusText.textContent = `Ready: ${ready.join(", ")}`
    } else {
      uploadStatus.className = "upload-status info"
      uploadStatusText.textContent = "Select documents to upload"
    }
  }

  // Update button titles for better UX
  if (!hasFileInput) {
    uploadResumeBtn.title = "Navigate to a page with file upload"
    uploadCoverBtn.title = "Navigate to a page with file upload"
  } else {
    uploadResumeBtn.title = resumeDoc?.resumeUrl ? "Upload resume to file input" : "Select a resume first"
    uploadCoverBtn.title = coverLetterDoc?.coverLetterUrl ? "Upload cover letter to file input" : "Select a cover letter first"
  }
}

// Check for file input on the current page
async function checkForFileInput() {
  const result = await api.checkFileInput()
  hasFileInput = result.hasFileInput
  updateUploadButtonsState()
}

// Render generation progress steps
function renderGenerationSteps(steps: GenerationStep[]) {
  if (steps.length === 0) {
    generationSteps.innerHTML = '<div class="empty-placeholder">Starting...</div>'
    return
  }

  generationSteps.innerHTML = steps
    .map((step) => `
      <div class="gen-step ${step.status}">
        <span class="gen-step-indicator"></span>
        <span class="gen-step-name">${escapeHtml(step.name)}</span>
      </div>
    `)
    .join("")
}

// Handle generation progress updates
function handleGenerationProgress(progress: GenerationProgress) {
  renderGenerationSteps(progress.steps)

  if (progress.status === "completed") {
    setStatus("Documents generated successfully", "success")
    generationProgress.classList.add("hidden")
    generateBtn.disabled = false
    setWorkflowStep("docs", "completed")
    setWorkflowStep("fill", "active")
    // Clean up the listener now that generation is complete
    cleanupGenerationProgressListener()
    // Reload documents and auto-select the newly generated one
    if (selectedJobMatchId) {
      loadDocuments(selectedJobMatchId, progress.requestId)
    }
  } else if (progress.status === "failed") {
    setStatus(progress.error || "Generation failed", "error")
    generateBtn.disabled = false
    // Clean up the listener on failure too
    cleanupGenerationProgressListener()
  } else if (progress.status === "awaiting_review") {
    // Delegate to the review handler
    handleGenerationAwaitingReview(progress)
  }
}

// Clean up generation progress listener and reset state
function cleanupGenerationProgressListener() {
  if (unsubscribeGenerationProgress) {
    unsubscribeGenerationProgress()
    unsubscribeGenerationProgress = null
  }
  isGenerating = false
}

// ============================================================================
// Document Review Form
// ============================================================================

// Handle generation awaiting review
async function handleGenerationAwaitingReview(progress: GenerationProgress) {
  log.info("Generation awaiting review:", progress.requestId)

  // Show loading state while fetching draft
  setStatus("Loading content for review...", "loading")

  // Fetch the draft content
  const result = await api.fetchDraftContent(progress.requestId)
  if (!result.success || !result.data) {
    setStatus(result.message || "Failed to fetch draft content", "error")
    generationProgress.classList.add("hidden")
    generateBtn.disabled = false
    return
  }

  const draft = result.data
  currentReviewRequestId = progress.requestId
  currentReviewDocumentType = draft.documentType
  currentReviewContent = draft.content
  log.info("handleGenerationAwaitingReview: State set", {
    requestId: currentReviewRequestId,
    documentType: currentReviewDocumentType,
    hasContent: !!currentReviewContent
  })

  // Hide generation progress, show review modal
  generationProgress.classList.add("hidden")

  // Hide BrowserView so modal overlay is visible (BrowserView renders on top of HTML)
  log.info("handleGenerationAwaitingReview: Hiding BrowserView...")
  const hideResult = await api.hideBrowserView()
  log.info("handleGenerationAwaitingReview: hideBrowserView result", hideResult)
  reviewModalOverlay.classList.remove("hidden")
  log.info("handleGenerationAwaitingReview: Modal shown")

  // Set title based on document type
  const docTypeLabel = draft.documentType === "resume" ? "resume" : "cover letter"
  reviewTitle.textContent = draft.documentType === "resume" ? "Review Resume" : "Review Cover Letter"

  // Render the editable content
  renderReviewForm(draft.documentType, draft.content)

  setStatus(`Review your ${docTypeLabel} before generating PDF`, "loading")
}

// Render the review form based on document type
function renderReviewForm(documentType: "resume" | "coverLetter", content: ResumeContent | CoverLetterContent) {
  if (documentType === "resume") {
    renderResumeReviewForm(content as ResumeContent)
  } else {
    renderCoverLetterReviewForm(content as CoverLetterContent)
  }
  // Setup auto-resizing for all textareas after content is rendered
  setupAutoResizeTextareas()
}

// Render resume review form
function renderResumeReviewForm(content: ResumeContent) {
  let html = `
    <div class="review-field">
      <div class="review-field-label">Professional Title</div>
      <input type="text" class="review-input" id="review-title" value="${escapeHtml(content.personalInfo?.title || "")}" placeholder="e.g., Senior Software Engineer, Full Stack Developer" />
    </div>
    <div class="review-field">
      <div class="review-field-label">Professional Summary</div>
      <textarea class="review-textarea" id="review-summary" rows="4">${escapeHtml(content.professionalSummary || "")}</textarea>
    </div>
  `

  // Add experience sections with editable highlights
  if (Array.isArray(content.experience) && content.experience.length > 0) {
    html += `<div class="review-field-label">Experience Highlights</div>`
    content.experience.forEach((exp, expIndex) => {
      if (!exp) return
      const role = exp.role || "Role"
      const company = exp.company || "Company"
      html += `
        <div class="review-experience-group" data-exp-index="${expIndex}">
          <div class="review-experience-header">${escapeHtml(role)} at ${escapeHtml(company)}</div>
          <div class="review-highlights" id="review-highlights-${expIndex}">
      `
      if (Array.isArray(exp.highlights) && exp.highlights.length > 0) {
        exp.highlights.forEach((highlight, hlIndex) => {
          html += `
            <div class="review-highlight-item">
              <textarea class="review-textarea" data-exp="${expIndex}" data-hl="${hlIndex}" rows="2">${escapeHtml(highlight || "")}</textarea>
            </div>
          `
        })
      }
      html += `
          </div>
        </div>
      `
    })
  }

  reviewContent.innerHTML = html
}

// Render cover letter review form
function renderCoverLetterReviewForm(content: CoverLetterContent) {
  let html = `
    <div class="review-field">
      <div class="review-field-label">Greeting</div>
      <textarea class="review-textarea" id="review-greeting" rows="1">${escapeHtml(content.greeting || "")}</textarea>
    </div>
    <div class="review-field">
      <div class="review-field-label">Opening Paragraph</div>
      <textarea class="review-textarea" id="review-opening" rows="3">${escapeHtml(content.openingParagraph || "")}</textarea>
    </div>
  `

  // Body paragraphs
  if (Array.isArray(content.bodyParagraphs) && content.bodyParagraphs.length > 0) {
    content.bodyParagraphs.forEach((para, index) => {
      html += `
        <div class="review-field">
          <div class="review-field-label">Body Paragraph ${index + 1}</div>
          <textarea class="review-textarea" id="review-body-${index}" rows="3">${escapeHtml(para || "")}</textarea>
        </div>
      `
    })
  }

  html += `
    <div class="review-field">
      <div class="review-field-label">Closing Paragraph</div>
      <textarea class="review-textarea" id="review-closing" rows="3">${escapeHtml(content.closingParagraph || "")}</textarea>
    </div>
    <div class="review-field">
      <div class="review-field-label">Signature</div>
      <textarea class="review-textarea" id="review-signature" rows="1">${escapeHtml(content.signature || "")}</textarea>
    </div>
  `

  reviewContent.innerHTML = html
}

// Helper to escape HTML
function escapeHtml(text: string): string {
  const div = document.createElement("div")
  div.textContent = text
  return div.innerHTML
}

// Auto-resize a textarea to fit its content
function autoResizeTextarea(textarea: HTMLTextAreaElement) {
  // Reset height to auto to get the correct scrollHeight
  textarea.style.height = "auto"
  // Set height to scrollHeight (content height) with a minimum
  const minHeight = 40 // Minimum height in pixels
  const maxHeight = 400 // Maximum height in pixels (matches CSS .review-textarea max-height)
  const newHeight = Math.min(Math.max(textarea.scrollHeight, minHeight), maxHeight)
  textarea.style.height = `${newHeight}px`
  // Show scrollbar if content exceeds max height
  textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden"
}

// Setup auto-resize for all textareas in the review form
function setupAutoResizeTextareas() {
  const textareas = reviewContent.querySelectorAll<HTMLTextAreaElement>(".review-textarea")
  textareas.forEach((textarea) => {
    // Initial resize
    autoResizeTextarea(textarea)
    // Resize on input
    textarea.addEventListener("input", () => autoResizeTextarea(textarea))
  })
}

// Collect edited content from the form
function collectReviewedContent(): ResumeContent | CoverLetterContent | null {
  if (!currentReviewDocumentType || !currentReviewContent) return null

  if (currentReviewDocumentType === "resume") {
    return collectResumeContent(currentReviewContent as ResumeContent)
  } else {
    return collectCoverLetterContent(currentReviewContent as CoverLetterContent)
  }
}

// Collect edited resume content
function collectResumeContent(original: ResumeContent): ResumeContent {
  const titleEl = document.getElementById("review-title") as HTMLInputElement
  const title = titleEl?.value || original.personalInfo?.title || ""
  const summaryEl = document.getElementById("review-summary") as HTMLTextAreaElement
  const summary = summaryEl?.value || original.professionalSummary

  // Collect updated highlights
  const experience = original.experience.map((exp, expIndex) => {
    const highlightEls = document.querySelectorAll(`textarea[data-exp="${expIndex}"]`) as NodeListOf<HTMLTextAreaElement>
    const highlights = Array.from(highlightEls).map((el) => el.value.trim()).filter(Boolean)
    // Always use collected highlights, even if empty (allows user to clear all)
    return { ...exp, highlights }
  })

  return {
    ...original,
    personalInfo: {
      ...original.personalInfo,
      title,
    },
    professionalSummary: summary,
    experience,
  }
}

// Collect edited cover letter content
function collectCoverLetterContent(original: CoverLetterContent): CoverLetterContent {
  const greeting = (document.getElementById("review-greeting") as HTMLTextAreaElement)?.value || original.greeting
  const openingParagraph = (document.getElementById("review-opening") as HTMLTextAreaElement)?.value || original.openingParagraph
  const closingParagraph = (document.getElementById("review-closing") as HTMLTextAreaElement)?.value || original.closingParagraph
  const signature = (document.getElementById("review-signature") as HTMLTextAreaElement)?.value || original.signature

  // Collect body paragraphs
  const bodyParagraphs: string[] = []
  let i = 0
  let bodyEl = document.getElementById(`review-body-${i}`) as HTMLTextAreaElement
  while (bodyEl) {
    const value = bodyEl.value.trim()
    if (value) bodyParagraphs.push(value)
    i++
    bodyEl = document.getElementById(`review-body-${i}`) as HTMLTextAreaElement
  }

  // Always use collected paragraphs, even if empty (allows user to clear all)
  return {
    greeting,
    openingParagraph,
    bodyParagraphs,
    closingParagraph,
    signature,
  }
}

// Submit the reviewed content
async function submitReview() {
  log.info("submitReview called", { currentReviewRequestId, currentReviewDocumentType })

  if (!currentReviewRequestId || !currentReviewDocumentType) {
    log.error("submitReview: No review in progress", { currentReviewRequestId, currentReviewDocumentType })
    setStatus("No review in progress", "error")
    return
  }

  const editedContent = collectReviewedContent()
  if (!editedContent) {
    log.error("submitReview: Failed to collect content")
    setStatus("Failed to collect reviewed content", "error")
    return
  }

  log.info("submitReview: Submitting...", { documentType: currentReviewDocumentType })
  setStatus("Submitting review...", "loading")
  approveReviewBtn.disabled = true

  try {
    const result = await api.submitDocumentReview({
      requestId: currentReviewRequestId,
      documentType: currentReviewDocumentType,
      content: editedContent,
    })

    log.info("submitReview: Got result", { success: result.success, status: result.data?.status, message: result.message })

    if (result.success && result.data) {
      // Hide review modal temporarily
      reviewModalOverlay.classList.add("hidden")
      approveReviewBtn.disabled = false
      currentReviewRequestId = null
      currentReviewDocumentType = null
      currentReviewContent = null

      // Check if there's another review needed or if generation is complete
      if (result.data.status === "awaiting_review") {
        // Another document needs review - trigger the handler directly
        // (handleGenerationAwaitingReview will hide BrowserView again)
        setStatus("Review submitted. Loading next document...", "loading")
        await handleGenerationAwaitingReview(result.data)
      } else {
        // Restore BrowserView now that modal is closed
        await api.showBrowserView()
        if (result.data.status === "completed") {
          handleGenerationProgress(result.data)
        } else {
          // Generation is continuing
          generationProgress.classList.remove("hidden")
          setStatus("Generating PDF...", "loading")
        }
      }
    } else {
      setStatus(result.message || "Failed to submit review", "error")
      approveReviewBtn.disabled = false
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to submit review"
    setStatus(message, "error")
    approveReviewBtn.disabled = false
  }
}

// Cancel the review
async function cancelReview() {
  reviewModalOverlay.classList.add("hidden")
  // Restore BrowserView now that modal is closed
  await api.showBrowserView()
  generationProgress.classList.add("hidden")
  generateBtn.disabled = false
  currentReviewRequestId = null
  currentReviewDocumentType = null
  currentReviewContent = null
  cleanupGenerationProgressListener()
  // Reset workflow step to allow retry
  setWorkflowStep("docs", "active")
  setStatus("Review cancelled", "")
}

// Generate new document
async function generateDocument() {
  // Disable button immediately to prevent double-clicks
  generateBtn.disabled = true

  if (!selectedJobMatchId) {
    setStatus("Select a job match first", "error")
    generateBtn.disabled = false
    return
  }

  // Prevent concurrent generations - atomic check and set
  if (isGenerating) {
    setStatus("Generation already in progress", "error")
    generateBtn.disabled = false
    return
  }
  isGenerating = true

  try {
    // Show generation progress UI
    generationProgress.classList.remove("hidden")
    generationSteps.innerHTML = '<div class="loading-placeholder">Starting generation...</div>'
    setStatus("Generating documents...", "loading")

    // Subscribe to progress updates (clean up any existing listener first)
    cleanupGenerationProgressListener()
    unsubscribeGenerationProgress = api.onGenerationProgress(handleGenerationProgress)

    // Get selected document type
    const generateType = generateTypeSelect.value as "resume" | "coverLetter" | "both"

    // Start generation with sequential step execution
    const result = await api.runGeneration({
      jobMatchId: selectedJobMatchId,
      type: generateType,
    })

    if (result.success && result.data) {
      // Final update from result (will also cleanup listener)
      handleGenerationProgress(result.data)
    } else {
      setStatus(result.message || "Generation failed", "error")
      generationProgress.classList.add("hidden")
      generateBtn.disabled = false
      cleanupGenerationProgressListener()
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Generation failed"
    setStatus(message, "error")
    generationProgress.classList.add("hidden")
    generateBtn.disabled = false
    cleanupGenerationProgressListener()
  } finally {
    isGenerating = false
  }
}

// Mark job match as applied
async function markAsApplied() {
  if (!selectedJobMatchId) return

  setStatus("Marking as applied...", "loading")
  markAppliedBtn.disabled = true

  try {
    const result = await api.updateJobMatchStatus({
      id: selectedJobMatchId,
      status: "applied",
    })

    if (result.success) {
      setStatus("Marked as applied", "success")
      // Update local state
      const match = jobMatches.find((m) => m.id === selectedJobMatchId)
      if (match) {
        match.status = "applied"
      }
      // Update workflow
      setWorkflowStep("submit", "completed")
      renderJobSelect()
      markIgnoredBtn.disabled = false
    } else {
      setStatus(result.message || "Failed to update status", "error")
      markAppliedBtn.disabled = false
    }
  } catch (error) {
    setStatus("Failed to update status", "error")
    markAppliedBtn.disabled = false
    console.error("Error marking job as applied:", error)
  }
}

// Mark job match as ignored
async function markAsIgnored() {
  if (!selectedJobMatchId) return

  setStatus("Marking as ignored...", "loading")
  markIgnoredBtn.disabled = true

  try {
    const result = await api.updateJobMatchStatus({
      id: selectedJobMatchId,
      status: "ignored",
    })

    if (result.success) {
      setStatus("Marked as ignored", "success")
      // Update local state
      const match = jobMatches.find((m) => m.id === selectedJobMatchId)
      if (match) {
        match.status = "ignored"
      }
      renderJobSelect()
      markAppliedBtn.disabled = false
    } else {
      setStatus(result.message || "Failed to update status", "error")
      markIgnoredBtn.disabled = false
    }
  } catch (error) {
    setStatus("Failed to update status", "error")
    markIgnoredBtn.disabled = false
    console.error("Error marking job as ignored:", error)
  }
}

// Check if a URL matches any job match and auto-select it
async function checkUrlForJobMatch(url: string) {
  try {
    const result = await api.findJobMatchByUrl(url)
    if (result.success && result.data) {
      const match = result.data
      // Add to job matches list if not present
      if (!jobMatches.find((m) => m.id === match.id)) {
        jobMatches.unshift(match)
        renderJobSelect()
      }
      // Auto-select the match (but don't navigate again)
      selectedJobMatchId = match.id ?? null
      selectedResumeId = null
      selectedCoverLetterId = null
      jobSelect.value = match.id ?? ""

      // Update fill button state (depends on selectedJobMatchId)
      updateAgentStatusUI(_agentSessionState)

      // Update workflow state
      setWorkflowStep("job", "completed")
      setWorkflowStep("docs", "active")

      // Show job actions section
      jobActionsSection.classList.remove("hidden")
      markAppliedBtn.disabled = match.status === "applied"
      markIgnoredBtn.disabled = match.status === "ignored"

      // Load documents only when we have an id
      if (match.id) {
        await loadDocuments(match.id)
        generateBtn.disabled = false
        setStatus(`Matched: ${match.listing.title} at ${match.listing.companyName}`, "success")
      } else {
        log.warn("No match.id found; skipping document load")
        generateBtn.disabled = true
        setStatus("Matched job has no id; cannot load documents", "error")
      }
    }
  } catch (err) {
    log.warn("Failed to check URL for job match:", err)
  }
}

// Navigate to URL
async function navigate() {
  const url = urlInput.value.trim()
  if (!url) {
    setStatus("Enter a URL", "error")
    return
  }

  // Add https:// if no protocol, and normalize protocol case to lowercase
  let fullUrl: string
  if (/^https?:\/\//i.test(url)) {
    // Normalize protocol to lowercase (HTTP:// -> http://, HTTPS:// -> https://)
    fullUrl = url.replace(/^(https?):\/\//i, (_, proto) => `${proto.toLowerCase()}://`)
  } else {
    fullUrl = `https://${url}`
  }

  setButtonsEnabled(false)
  setStatus("Loading...", "loading")

  const navResult = await api.navigate(fullUrl)

  if (navResult.success) {
    setStatus("Page loaded", "success")

    // Check if this URL matches any job match
    await checkUrlForJobMatch(fullUrl)

    // Check for file input on the new page (with delay for page to render)
    setTimeout(checkForFileInput, 500)
    refreshNavigationState()
  } else {
    setStatus(navResult.message || "Navigation failed", "error")
  }

  setButtonsEnabled(true)
}

async function goBack() {
  const result = await api.goBack()
  if (!result.success) {
    setStatus(result.message || "No page to go back to", "error")
    backBtn.disabled = !result.canGoBack
    return
  }
  setStatus("Navigated back", "success")
  setTimeout(checkForFileInput, 500)
  refreshNavigationState()
}

// ============================================================================
// Agent Session Management
// ============================================================================

// Agent session state
let _agentSessionState: AgentSessionState = "stopped"
let unsubscribeAgentOutput: (() => void) | null = null
let unsubscribeAgentStatus: (() => void) | null = null
let unsubscribeBrowserUrlChanged: (() => void) | null = null
let isFormFillActive = false
const agentOutputParser = new StreamingParser()

// Update agent status display
function updateAgentStatusUI(state: AgentSessionState) {
  _agentSessionState = state
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
    startSessionBtn.disabled = false
  } else {
    startSessionBtn.classList.add("hidden")
    stopSessionBtn.classList.remove("hidden")
    agentActions.classList.remove("hidden")
  }

  // Fill button enabled only when idle and job selected
  fillFormBtn.disabled = state !== "idle" || !selectedJobMatchId
}

// Start agent session - sets up listeners and transitions to idle state
function startAgentSession() {
  startSessionBtn.disabled = true
  setStatus("Starting agent session...", "loading")
  agentOutput.innerHTML = '<div class="empty-placeholder">Ready for form fill</div>'

  // Subscribe to events
  ensureAgentListeners()

  setStatus("Agent session ready", "success")
  updateAgentStatusUI("idle")
}

// Stop agent session and any active form fill
async function stopAgentSession() {
  setStatus("Stopping agent session...", "loading")

  // Stop any active form fill
  if (isFormFillActive) {
    await api.stopFillForm()
    isFormFillActive = false
  }

  cleanupAgentListeners()
  updateAgentStatusUI("stopped")
  setStatus("Agent session stopped", "success")
  agentOutput.innerHTML = '<div class="empty-placeholder">Session ended</div>'
}

// Ensure agent event listeners are set up
function ensureAgentListeners() {
  if (!unsubscribeAgentOutput) {
    log.debug("Setting up agent output listener")
    unsubscribeAgentOutput = api.onAgentOutput((data) => {
      log.debug("Received agent output (" + data.text.length + " chars):", data.text.slice(0, 100).replace(/\n/g, "\\n"))
      appendAgentOutput(data.text, data.isError ? "error" : undefined)
    })
  }
  if (!unsubscribeAgentStatus) {
    log.debug("Setting up agent status listener")
    unsubscribeAgentStatus = api.onAgentStatus((data) => {
      log.debug("Received agent status:", data)
      updateAgentStatusUI(data.state as AgentSessionState)
      if (data.state === "idle" || data.state === "stopped") {
        isFormFillActive = false
        fillFormBtn.disabled = data.state !== "idle" || !selectedJobMatchId
      }
    })
  }
  if (!unsubscribeBrowserUrlChanged) {
    unsubscribeBrowserUrlChanged = api.onBrowserUrlChanged((data) => {
      urlInput.value = data.url
      refreshNavigationState()
    })
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

  // Ensure listeners are set up before starting fill
  ensureAgentListeners()

  // Build job context
  const jobContext = [
    `Job: ${match.listing.title} at ${match.listing.companyName}`,
    match.listing.location ? `Location: ${match.listing.location}` : "",
    match.listing.description
      ? `Description: ${match.listing.description.length > 500 ? match.listing.description.slice(0, 500) + "..." : match.listing.description}`
      : "",
  ].filter(Boolean).join("\n")

  setStatus("Filling form...", "loading")
  setWorkflowStep("fill", "active")
  isFormFillActive = true
  fillFormBtn.disabled = true

  // Reset parser and clear output
  agentOutputParser.reset()
  agentOutput.innerHTML = '<div class="loading-placeholder">Starting form fill...</div>'

  // Get selected document URLs for the agent to upload
  const resumeDoc = getSelectedResume()
  const coverLetterDoc = getSelectedCoverLetter()

  log.info("Calling api.fillForm for job:", selectedJobMatchId)
  const result = await api.fillForm({
    jobMatchId: selectedJobMatchId,
    jobContext,
    resumeUrl: resumeDoc?.resumeUrl,
    coverLetterUrl: coverLetterDoc?.coverLetterUrl,
  })
  log.info("api.fillForm returned:", result)

  if (result.success) {
    setStatus("Form fill running", "success")
  } else {
    setStatus(result.message || "Fill failed", "error")
    isFormFillActive = false
    fillFormBtn.disabled = false
    agentOutput.innerHTML = `<div class="empty-placeholder">${result.message || "Fill failed"}</div>`
  }
}

// Render a single parsed activity as a DOM element
function renderActivity(activity: ParsedActivity): HTMLElement {
  const div = document.createElement("div")
  div.className = `agent-activity ${activity.type}`

  switch (activity.type) {
    case "tool_call":
      div.innerHTML = `<span class="activity-icon">${activity.icon || "🔧"}</span><span class="activity-text">${escapeHtml(activity.displayText)}</span>`
      break
    case "tool_result":
      div.innerHTML = `<span class="activity-icon">${activity.icon || "✓"}</span><span class="activity-text">${escapeHtml(activity.displayText)}</span>`
      break
    case "thinking":
      div.innerHTML = `<span class="activity-icon">${activity.icon || "🤔"}</span><span class="activity-text">${escapeHtml(activity.displayText)}</span>`
      break
    case "completion":
      div.innerHTML = `<span class="activity-icon">${activity.icon || "✅"}</span><span class="activity-text">${escapeHtml(activity.displayText)}</span>`
      break
    case "error":
      div.classList.add("agent-error")
      div.innerHTML = `<span class="activity-icon">${activity.icon || "❌"}</span><span class="activity-text">${escapeHtml(activity.displayText)}</span>`
      break
    default:
      // Plain text - only show if meaningful (not just whitespace or short noise)
      if (activity.displayText.length > 10) {
        div.innerHTML = `<span class="activity-text">${escapeHtml(activity.displayText)}</span>`
      } else {
        return div // Return empty div for short noise
      }
  }

  return div
}

// Append text to agent output with parsing
function appendAgentOutput(text: string, type?: "error") {
  // Remove placeholder if present
  const placeholder = agentOutput.querySelector(".empty-placeholder, .loading-placeholder")
  if (placeholder) {
    agentOutput.innerHTML = ""
  }

  if (type === "error") {
    // Errors are displayed directly without parsing
    const div = document.createElement("div")
    div.className = "agent-activity error agent-error"
    div.innerHTML = `<span class="activity-icon">❌</span><span class="activity-text">${escapeHtml(text)}</span>`
    agentOutput.appendChild(div)
  } else {
    // Parse the output and render activities
    const activities = agentOutputParser.addChunk(text)
    for (const activity of activities) {
      const element = renderActivity(activity)
      if (element.innerHTML) { // Only append if there's content
        agentOutput.appendChild(element)
      }
    }
  }

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
  if (unsubscribeBrowserUrlChanged) {
    unsubscribeBrowserUrlChanged()
    unsubscribeBrowserUrlChanged = null
  }
}

// Upload document (resume or cover letter)
async function uploadDocument(type: "resume" | "coverLetter") {
  const doc = type === "resume" ? getSelectedResume() : getSelectedCoverLetter()
  const documentUrl = type === "resume" ? doc?.resumeUrl : doc?.coverLetterUrl

  if (!documentUrl) {
    setStatus(`Select a ${type === "coverLetter" ? "cover letter" : "resume"} first`, "error")
    return
  }

  const typeLabel = type === "coverLetter" ? "cover letter" : "resume"

  try {
    setButtonsEnabled(false)
    setStatus(`Uploading ${typeLabel}...`, "loading")

    const result = await api.uploadResume({ documentUrl, type })

    if (result.success) {
      setStatus(result.message, "success")
    } else {
      setStatus(result.message, "error")
      if (result.filePath) {
        log.debug("Manual upload path:", result.filePath)
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    setStatus(`Upload failed: ${message}`, "error")
  } finally {
    setButtonsEnabled(true)
  }
}

// Convenience wrappers for upload buttons
function uploadResumeFile() {
  uploadDocument("resume")
}

function uploadCoverLetterFile() {
  uploadDocument("coverLetter")
}

// Preview document (opens in default PDF viewer)
async function previewDocument(type: "resume" | "coverLetter") {
  const doc = type === "resume" ? getSelectedResume() : getSelectedCoverLetter()
  const url = type === "resume" ? doc?.resumeUrl : doc?.coverLetterUrl
  const typeLabel = type === "coverLetter" ? "cover letter" : "resume"

  if (!url) {
    setStatus(`No ${typeLabel} selected`, "error")
    return
  }

  try {
    setStatus(`Opening ${typeLabel}...`, "loading")
    const result = await api.openDocument(url)
    if (result.success) {
      setStatus(`Opened ${typeLabel}`, "success")
    } else {
      setStatus(result.message || `Failed to open ${typeLabel}`, "error")
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    setStatus(`Failed to open ${typeLabel}: ${message}`, "error")
  }
}

function previewResume() {
  previewDocument("resume")
}

function previewCoverLetter() {
  previewDocument("coverLetter")
}

// Submit job listing for analysis
async function submitJob() {
  // Provider hardcoded to gemini (job extraction uses Gemini API)
  const provider = "gemini" as const

  try {
    setButtonsEnabled(false)
    setStatus("Extracting job details with Gemini...", "loading")
    const result = await api.submitJob(provider)

    if (result.success) {
      setStatus(result.message, "success")
    } else {
      setStatus(result.message, "error")
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    setStatus(`Submission failed: ${message}`, "error")
  } finally {
    setButtonsEnabled(true)
  }
}

// Utility: escape for HTML attributes (escapes quotes)
function escapeAttr(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

// Initialize application when DOM is ready
function initializeApp() {
  // Event listeners - Auth
  loginBtn.addEventListener("click", handleLogin)
  logoutBtn.addEventListener("click", handleLogout)

  // Event listeners - Toolbar
  backBtn.addEventListener("click", goBack)
  goBtn.addEventListener("click", navigate)
  urlInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      navigate()
    }
  })
  submitJobBtn.addEventListener("click", submitJob)

  // Event listeners - Agent Session
  startSessionBtn.addEventListener("click", startAgentSession)
  stopSessionBtn.addEventListener("click", stopAgentSession)
  fillFormBtn.addEventListener("click", fillFormWithAgent)

  // Event listeners - Sidebar
  jobSelect.addEventListener("change", () => {
    const id = jobSelect.value
    if (id) {
      selectJobMatch(id)
    } else {
      // Deselected - clear state
      selectedJobMatchId = null
      selectedResumeId = null
      selectedCoverLetterId = null
      jobActionsSection.classList.add("hidden")
      generateBtn.disabled = true
      updateUploadButtonsState()
      updateAgentStatusUI(_agentSessionState)
    }
  })
  generateBtn.addEventListener("click", generateDocument)
  markAppliedBtn.addEventListener("click", markAsApplied)
  markIgnoredBtn.addEventListener("click", markAsIgnored)
  uploadResumeBtn.addEventListener("click", uploadResumeFile)
  uploadCoverBtn.addEventListener("click", uploadCoverLetterFile)
  rescanBtn.addEventListener("click", checkForFileInput)
  refreshJobsBtn.addEventListener("click", refreshJobMatches)

  // Event listeners - Document dropdowns
  resumeSelect.addEventListener("change", () => {
    selectedResumeId = resumeSelect.value || null
    updateUploadButtonsState()
  })
  coverLetterSelect.addEventListener("change", () => {
    selectedCoverLetterId = coverLetterSelect.value || null
    updateUploadButtonsState()
  })

  // Event listeners - Preview buttons
  previewResumeBtn.addEventListener("click", previewResume)
  previewCoverLetterBtn.addEventListener("click", previewCoverLetter)

  // Event listeners - Document Review buttons
  log.info("Setting up review button event listeners")
  approveReviewBtn.addEventListener("click", () => {
    log.info("Approve button clicked!")
    submitReview()
  })
  cancelReviewBtn.addEventListener("click", () => {
    log.info("Cancel button clicked!")
    cancelReview()
  })

  // Subscribe to generation review events
  unsubscribeGenerationReview = api.onGenerationAwaitingReview(handleGenerationAwaitingReview)

  // Listen for Ctrl+R global shortcut from main process
  // This ensures refresh works even when BrowserView has focus
  api.onRefreshJobMatches(() => {
    refreshJobMatches()
  })

  // Initial navigation state
  refreshNavigationState()

  // Run async initialization
  init()
}

// Initialize
async function init() {
  setStatus("Checking authentication...", "loading")

  // Initialize workflow progress
  updateWorkflowProgress()

  // Initialize upload button state
  updateUploadButtonsState()

  // Check auth state on startup
  try {
    const authState = await api.auth.getUser()
    if (authState.authenticated && authState.user) {
      updateAuthUI(authState.user)
      // Load job matches only if authenticated
      await loadJobMatches()
    } else {
      updateAuthUI(null)
    }
  } catch (err) {
    log.warn("Failed to check auth state:", err)
    updateAuthUI(null)
  }
}

// Cleanup on page unload to prevent memory leaks
window.addEventListener("beforeunload", () => {
  cleanupGenerationProgressListener()
  cleanupAgentListeners()
  if (unsubscribeGenerationReview) {
    unsubscribeGenerationReview()
    unsubscribeGenerationReview = null
  }
})

// Wait for DOM to be ready before initializing
log.debug("document.readyState:", document.readyState)
if (document.readyState === "loading") {
  log.debug("Waiting for DOMContentLoaded...")
  document.addEventListener("DOMContentLoaded", () => {
    log.debug("DOMContentLoaded fired, calling initializeApp")
    initializeApp()
  })
} else {
  // DOM is already ready
  log.debug("DOM already ready, calling initializeApp")
  initializeApp()
}
