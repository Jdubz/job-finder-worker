// Type declarations for the exposed API
interface JobMatchListItem {
  id: string
  matchScore: number
  status: "active" | "ignored" | "applied"
  listing: {
    id: string
    url: string
    title: string
    companyName: string
    location?: string
  }
}

interface DocumentInfo {
  id: string
  generateType: "resume" | "coverLetter" | "both"
  status: "pending" | "processing" | "completed" | "failed"
  resumeUrl?: string
  coverLetterUrl?: string
  createdAt: string
  jobMatchId?: string
}

interface FormFillSummary {
  totalFields: number
  filledCount: number
  skippedCount: number
  skippedFields: Array<{ label: string; reason: string }>
  duration: number
}

interface GenerationStep {
  id: string
  name: string
  description: string
  status: "pending" | "in_progress" | "completed" | "failed" | "skipped"
  duration?: number
  result?: {
    resumeUrl?: string
    coverLetterUrl?: string
  }
  error?: {
    message: string
    code?: string
  }
}

interface GenerationProgress {
  requestId: string
  status: string
  steps: GenerationStep[]
  currentStep?: string
  resumeUrl?: string
  coverLetterUrl?: string
  error?: string
}

// Workflow steps tracking
type WorkflowStep = "job" | "docs" | "fill" | "submit"
interface WorkflowState {
  job: "pending" | "active" | "completed"
  docs: "pending" | "active" | "completed"
  fill: "pending" | "active" | "completed"
  submit: "pending" | "active" | "completed"
}

interface ElectronAPI {
  navigate: (url: string) => Promise<void>
  getUrl: () => Promise<string>
  fillForm: (provider: "claude" | "codex" | "gemini") => Promise<{ success: boolean; message: string }>
  fillFormEnhanced: (options: {
    provider: "claude" | "codex" | "gemini"
    jobMatchId?: string
    documentId?: string
  }) => Promise<{ success: boolean; data?: FormFillSummary; message?: string }>
  uploadResume: (options?: {
    documentId?: string
    type?: "resume" | "coverLetter"
  }) => Promise<{ success: boolean; message: string; filePath?: string }>
  submitJob: (provider: "claude" | "codex" | "gemini") => Promise<{ success: boolean; message: string }>
  getCdpStatus: () => Promise<{ connected: boolean; message?: string }>
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
  getDocuments: (jobMatchId: string) => Promise<{
    success: boolean
    data?: DocumentInfo[]
    message?: string
  }>
  startGeneration: (options: {
    jobMatchId: string
    type: "resume" | "coverLetter" | "both"
  }) => Promise<{ success: boolean; requestId?: string; message?: string }>
  runGeneration: (options: {
    jobMatchId: string
    type: "resume" | "coverLetter" | "both"
  }) => Promise<{ success: boolean; data?: GenerationProgress; message?: string }>
  onGenerationProgress: (callback: (progress: GenerationProgress) => void) => () => void
}

// Debug: log immediately when script loads
console.log("[app.ts] Script loaded")

// Extend Window interface - with safety check for missing preload
// Use window.electronAPI directly to avoid any naming conflicts
declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

console.log("[app.ts] Checking for api...", window.electronAPI)
if (!window.electronAPI) {
  console.error("[app.ts] electronAPI not found!")
  throw new Error("Electron API not available. Preload script may have failed to load.")
}
console.log("[app.ts] electronAPI found!")
const api = window.electronAPI

// State
let selectedJobMatchId: string | null = null
let selectedDocumentId: string | null = null
let jobMatches: JobMatchListItem[] = []
let documents: DocumentInfo[] = []
const workflowState: WorkflowState = {
  job: "pending",
  docs: "pending",
  fill: "pending",
  submit: "pending",
}
let unsubscribeGenerationProgress: (() => void) | null = null
let isGenerating = false // Prevent concurrent document generations

// Helper to get DOM element with null check
function getElement<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id)
  if (!el) {
    throw new Error(`Required DOM element not found: #${id}`)
  }
  return el as T
}

// DOM elements - Toolbar
const urlInput = getElement<HTMLInputElement>("urlInput")
const goBtn = getElement<HTMLButtonElement>("goBtn")
const providerSelect = getElement<HTMLSelectElement>("providerSelect")
const fillBtn = getElement<HTMLButtonElement>("fillBtn")
const uploadBtn = getElement<HTMLButtonElement>("uploadBtn")
const submitJobBtn = getElement<HTMLButtonElement>("submitJobBtn")
const statusEl = getElement<HTMLSpanElement>("status")

// DOM elements - Sidebar
const jobList = getElement<HTMLDivElement>("jobList")
const documentsList = getElement<HTMLDivElement>("documentsList")
const generateBtn = getElement<HTMLButtonElement>("generateBtn")
const resultsContent = getElement<HTMLDivElement>("resultsContent")
const jobActionsSection = getElement<HTMLDivElement>("jobActionsSection")
const markAppliedBtn = getElement<HTMLButtonElement>("markAppliedBtn")
const markIgnoredBtn = getElement<HTMLButtonElement>("markIgnoredBtn")
const workflowProgress = getElement<HTMLDivElement>("workflowProgress")
const generationProgress = getElement<HTMLDivElement>("generationProgress")
const generationSteps = getElement<HTMLDivElement>("generationSteps")

function setStatus(message: string, type: "success" | "error" | "loading" | "" = "") {
  statusEl.textContent = message
  statusEl.className = "status" + (type ? ` ${type}` : "")
}

function setButtonsEnabled(enabled: boolean) {
  goBtn.disabled = !enabled
  fillBtn.disabled = !enabled
  uploadBtn.disabled = !enabled
  submitJobBtn.disabled = !enabled
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


// Load job matches from backend
async function loadJobMatches() {
  jobList.innerHTML = '<div class="loading-placeholder">Loading...</div>'

  const result = await api.getJobMatches({ limit: 50, status: "active" })

  if (result.success && result.data) {
    jobMatches = result.data
    renderJobList()
  } else {
    jobList.innerHTML = `<div class="empty-placeholder">${result.message || "Failed to load"}</div>`
  }
}

// Render job matches list
function renderJobList() {
  if (jobMatches.length === 0) {
    jobList.innerHTML = '<div class="empty-placeholder">No job matches found</div>'
    return
  }

  jobList.innerHTML = jobMatches
    .map((match) => {
      const scoreClass = match.matchScore >= 85 ? "high" : match.matchScore >= 70 ? "medium" : "low"
      const isSelected = match.id === selectedJobMatchId
      const statusBadge = match.status !== "active"
        ? `<span class="job-status-badge ${match.status}">${match.status}</span>`
        : ""
      return `
      <div class="job-item${isSelected ? " selected" : ""}" data-id="${escapeAttr(match.id)}">
        <div class="job-title">${escapeHtml(match.listing.title)}${statusBadge}</div>
        <div class="job-company">${escapeHtml(match.listing.companyName)}</div>
        <div class="job-score ${scoreClass}">${match.matchScore}% match</div>
      </div>
    `
    })
    .join("")

  // Add click handlers
  jobList.querySelectorAll(".job-item").forEach((el) => {
    el.addEventListener("click", () => {
      const id = (el as HTMLElement).dataset.id
      if (id) selectJobMatch(id)
    })
  })
}

// Select a job match
async function selectJobMatch(id: string) {
  selectedJobMatchId = id
  selectedDocumentId = null

  // Update UI
  renderJobList()

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
  try {
    await api.navigate(match.listing.url)
    urlInput.value = match.listing.url
    setStatus("Job listing loaded", "success")
  } catch (err) {
    setStatus(`Failed to load: ${err}`, "error")
  }

  // Load documents for this job match
  await loadDocuments(id)

  // Enable generate button
  generateBtn.disabled = false
}

// Load documents for a job match
async function loadDocuments(jobMatchId: string) {
  documentsList.innerHTML = '<div class="loading-placeholder">Loading...</div>'

  const result = await api.getDocuments(jobMatchId)

  if (result.success && result.data) {
    documents = result.data
    renderDocumentsList()
  } else {
    documentsList.innerHTML = `<div class="empty-placeholder">${result.message || "No documents"}</div>`
  }
}

// Render documents list
function renderDocumentsList() {
  if (documents.length === 0) {
    documentsList.innerHTML = '<div class="empty-placeholder">No documents yet</div>'
    return
  }

  documentsList.innerHTML = documents
    .map((doc) => {
      const typeLabel = doc.generateType === "both" ? "Resume + Cover Letter" : doc.generateType === "resume" ? "Resume" : "Cover Letter"
      const date = new Date(doc.createdAt).toLocaleDateString()
      const isSelected = doc.id === selectedDocumentId
      const statusBadge = doc.status !== "completed" ? ` (${doc.status})` : ""

      return `
      <div class="document-item${isSelected ? " selected" : ""}" data-id="${escapeAttr(doc.id)}">
        <span class="document-icon">${doc.generateType === "coverLetter" ? "CL" : "R"}</span>
        <div class="document-info">
          <div class="document-type">${escapeHtml(typeLabel)}${escapeHtml(statusBadge)}</div>
          <div class="document-date">${escapeHtml(date)}</div>
        </div>
        <div class="document-actions">
          ${doc.resumeUrl ? `<button class="btn-view" data-url="${escapeAttr(doc.resumeUrl)}" title="View Resume">R</button>` : ""}
          ${doc.coverLetterUrl ? `<button class="btn-view" data-url="${escapeAttr(doc.coverLetterUrl)}" title="View Cover Letter">CL</button>` : ""}
        </div>
      </div>
    `
    })
    .join("")

  // Add click handlers for selection
  documentsList.querySelectorAll(".document-item").forEach((el) => {
    el.addEventListener("click", (e) => {
      // Don't select if clicking a button
      if ((e.target as HTMLElement).tagName === "BUTTON") return
      const id = (el as HTMLElement).dataset.id
      if (id) selectDocument(id)
    })
  })

  // Add click handlers for view buttons
  documentsList.querySelectorAll(".btn-view").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation()
      const url = (btn as HTMLElement).dataset.url
      if (url) window.open(url, "_blank")
    })
  })
}

// Select a document
function selectDocument(id: string) {
  selectedDocumentId = selectedDocumentId === id ? null : id // Toggle selection
  renderDocumentsList()
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
    // Reload documents to show the new ones
    if (selectedJobMatchId) {
      loadDocuments(selectedJobMatchId)
    }
  } else if (progress.status === "failed") {
    setStatus(progress.error || "Generation failed", "error")
    generateBtn.disabled = false
    // Clean up the listener on failure too
    cleanupGenerationProgressListener()
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

// Generate new document
async function generateDocument() {
  if (!selectedJobMatchId) {
    setStatus("Select a job match first", "error")
    return
  }

  // Prevent concurrent generations
  if (isGenerating) {
    setStatus("Generation already in progress", "error")
    return
  }

  isGenerating = true

  // Show generation progress UI
  generationProgress.classList.remove("hidden")
  generationSteps.innerHTML = '<div class="loading-placeholder">Starting generation...</div>'
  setStatus("Generating documents...", "loading")
  generateBtn.disabled = true

  // Subscribe to progress updates (clean up any existing listener first)
  cleanupGenerationProgressListener()
  unsubscribeGenerationProgress = api.onGenerationProgress(handleGenerationProgress)

  // Start generation with sequential step execution
  const result = await api.runGeneration({
    jobMatchId: selectedJobMatchId,
    type: "both",
  })

  if (result.success && result.data) {
    // Final update from result (will also cleanup listener)
    handleGenerationProgress(result.data)
  } else if (!result.success) {
    setStatus(result.message || "Generation failed", "error")
    generationProgress.classList.add("hidden")
    generateBtn.disabled = false
    // Clean up listener on error path
    cleanupGenerationProgressListener()
  }
}

// Mark job match as applied
async function markAsApplied() {
  if (!selectedJobMatchId) return

  setStatus("Marking as applied...", "loading")
  markAppliedBtn.disabled = true

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
    renderJobList()
    markIgnoredBtn.disabled = false
  } else {
    setStatus(result.message || "Failed to update status", "error")
    markAppliedBtn.disabled = false
  }
}

// Mark job match as ignored
async function markAsIgnored() {
  if (!selectedJobMatchId) return

  setStatus("Marking as ignored...", "loading")
  markIgnoredBtn.disabled = true

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
    renderJobList()
    markAppliedBtn.disabled = false
  } else {
    setStatus(result.message || "Failed to update status", "error")
    markIgnoredBtn.disabled = false
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
        renderJobList()
      }
      // Auto-select the match (but don't navigate again)
      selectedJobMatchId = match.id
      selectedDocumentId = null
      renderJobList()

      // Update workflow state
      setWorkflowStep("job", "completed")
      setWorkflowStep("docs", "active")

      // Show job actions section
      jobActionsSection.classList.remove("hidden")
      markAppliedBtn.disabled = match.status === "applied"
      markIgnoredBtn.disabled = match.status === "ignored"

      // Load documents
      await loadDocuments(match.id)
      generateBtn.disabled = false

      setStatus(`Matched: ${match.listing.title} at ${match.listing.companyName}`, "success")
    }
  } catch (err) {
    console.warn("Failed to check URL for job match:", err)
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

  try {
    setButtonsEnabled(false)
    setStatus("Loading...", "loading")
    await api.navigate(fullUrl)
    setStatus("Page loaded", "success")

    // Check if this URL matches any job match
    await checkUrlForJobMatch(fullUrl)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    setStatus(`Navigation failed: ${message}`, "error")
  } finally {
    setButtonsEnabled(true)
  }
}

// Fill form with AI
async function fillForm() {
  const provider = providerSelect.value as "claude" | "codex" | "gemini"

  try {
    setButtonsEnabled(false)
    setStatus(`Filling form with ${provider}...`, "loading")
    setWorkflowStep("fill", "active")

    // Use enhanced fill if we have a job match selected
    if (selectedJobMatchId) {
      const result = await api.fillFormEnhanced({
        provider,
        jobMatchId: selectedJobMatchId,
        documentId: selectedDocumentId || undefined,
      })

      if (result.success && result.data) {
        renderFillResults(result.data)
        setStatus(`Filled ${result.data.filledCount}/${result.data.totalFields} fields`, "success")
        setWorkflowStep("fill", "completed")
        setWorkflowStep("submit", "active")
      } else {
        setStatus(result.message || "Fill failed", "error")
      }
    } else {
      // Fall back to basic fill
      const result = await api.fillForm(provider)

      if (result.success) {
        setStatus(result.message, "success")
        setWorkflowStep("fill", "completed")
        setWorkflowStep("submit", "active")
      } else {
        setStatus(result.message, "error")
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    setStatus(`Fill failed: ${message}`, "error")
  } finally {
    setButtonsEnabled(true)
  }
}

// Render fill results in sidebar
function renderFillResults(summary: FormFillSummary) {
  const hasSkipped = summary.skippedFields.length > 0

  resultsContent.innerHTML = `
    <div class="results-summary">
      <div class="results-header">
        <span class="results-count">${summary.filledCount}</span>
        <span class="results-label">of ${summary.totalFields} fields filled</span>
      </div>
      <div class="results-duration">${(summary.duration / 1000).toFixed(1)}s</div>
      ${
        hasSkipped
          ? `
        <div class="skipped-header">Skipped Fields (${summary.skippedCount})</div>
        <div class="skipped-list">
          ${summary.skippedFields
            .map(
              (f) => `
            <div class="skipped-item">
              <div class="skipped-label">${escapeHtml(f.label)}</div>
              <div class="skipped-reason">${escapeHtml(f.reason)}</div>
            </div>
          `
            )
            .join("")}
        </div>
      `
          : ""
      }
    </div>
  `

  // Scroll to results
  resultsContent.scrollIntoView({ behavior: "smooth" })
}

// Upload resume/document
async function uploadResume() {
  try {
    setButtonsEnabled(false)

    // Use selected document if available
    const options = selectedDocumentId
      ? { documentId: selectedDocumentId, type: "resume" as const }
      : undefined

    const statusMsg = selectedDocumentId ? "Uploading selected document..." : "Uploading resume..."
    setStatus(statusMsg, "loading")

    const result = await api.uploadResume(options)

    if (result.success) {
      setStatus(result.message, "success")
    } else {
      // Show file path for manual fallback if available
      if (result.filePath) {
        setStatus(result.message, "error")
        console.log("Manual upload path:", result.filePath)
      } else {
        setStatus(result.message, "error")
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    setStatus(`Upload failed: ${message}`, "error")
  } finally {
    setButtonsEnabled(true)
  }
}

// Submit job listing for analysis
async function submitJob() {
  const provider = providerSelect.value as "claude" | "codex" | "gemini"

  try {
    setButtonsEnabled(false)
    setStatus(`Extracting job details with ${provider}...`, "loading")
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

// Utility: escape HTML for content
function escapeHtml(str: string): string {
  const div = document.createElement("div")
  div.textContent = str
  return div.innerHTML
}

// Utility: escape for HTML attributes (escapes quotes)
function escapeAttr(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

// Initialize application when DOM is ready
function initializeApp() {
  // Event listeners
  goBtn.addEventListener("click", navigate)
  urlInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      navigate()
    }
  })
  fillBtn.addEventListener("click", fillForm)
  uploadBtn.addEventListener("click", uploadResume)
  submitJobBtn.addEventListener("click", submitJob)
  generateBtn.addEventListener("click", generateDocument)
  markAppliedBtn.addEventListener("click", markAsApplied)
  markIgnoredBtn.addEventListener("click", markAsIgnored)

  // Run async initialization
  init()
}

// Initialize
async function init() {
  setStatus("Ready")

  // Initialize workflow progress
  updateWorkflowProgress()

  // Check CDP connection status and warn if unavailable
  const cdpStatus = await api.getCdpStatus()
  if (!cdpStatus.connected) {
    // Disable upload button and show warning
    uploadBtn.disabled = true
    uploadBtn.title = cdpStatus.message || "File uploads unavailable"
    console.warn("CDP not connected:", cdpStatus.message)
  }

  // Load job matches on startup (sidebar is always visible)
  await loadJobMatches()
}

// Wait for DOM to be ready before initializing
console.log("[app.ts] document.readyState:", document.readyState)
if (document.readyState === "loading") {
  console.log("[app.ts] Waiting for DOMContentLoaded...")
  document.addEventListener("DOMContentLoaded", () => {
    console.log("[app.ts] DOMContentLoaded fired, calling initializeApp")
    initializeApp()
  })
} else {
  // DOM is already ready
  console.log("[app.ts] DOM already ready, calling initializeApp")
  initializeApp()
}
