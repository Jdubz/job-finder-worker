import type {
  JobMatchWithListing as JobMatchListItem,
  DocumentInfo,
  FormFillSummary,
  FormFillProgress,
  GenerationProgress,
  GenerationStep,
  WorkflowState,
  WorkflowStep,
} from "../types.js"

interface ElectronAPI {
  navigate: (url: string) => Promise<{ success: boolean; message?: string }>
  getUrl: () => Promise<string>
  fillForm: (options: {
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
  checkFileInput: () => Promise<{ hasFileInput: boolean; selector?: string }>
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
  onFormFillProgress: (callback: (progress: FormFillProgress) => void) => () => void
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
let hasFileInput = false // Whether current page has a file input element

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
const submitJobBtn = getElement<HTMLButtonElement>("submitJobBtn")
const statusEl = getElement<HTMLSpanElement>("status")

// DOM elements - Sidebar
const jobList = getElement<HTMLDivElement>("jobList")
const documentsList = getElement<HTMLDivElement>("documentsList")
const generateBtn = getElement<HTMLButtonElement>("generateBtn")
const generateTypeSelect = getElement<HTMLSelectElement>("generateType")
const fillOutput = getElement<HTMLDivElement>("fillOutput")
const jobActionsSection = getElement<HTMLDivElement>("jobActionsSection")
const markAppliedBtn = getElement<HTMLButtonElement>("markAppliedBtn")
const markIgnoredBtn = getElement<HTMLButtonElement>("markIgnoredBtn")
const workflowProgress = getElement<HTMLDivElement>("workflowProgress")
const generationProgress = getElement<HTMLDivElement>("generationProgress")
const generationSteps = getElement<HTMLDivElement>("generationSteps")

// DOM elements - Upload section
const uploadResumeBtn = getElement<HTMLButtonElement>("uploadResumeBtn")
const uploadCoverBtn = getElement<HTMLButtonElement>("uploadCoverBtn")
const uploadStatusText = getElement<HTMLSpanElement>("uploadStatusText")
const uploadStatus = getElement<HTMLDivElement>("uploadStatus")
const rescanBtn = getElement<HTMLButtonElement>("rescanBtn")

function setStatus(message: string, type: "success" | "error" | "loading" | "" = "") {
  statusEl.textContent = message
  statusEl.className = "status" + (type ? ` ${type}` : "")
}

function setButtonsEnabled(enabled: boolean) {
  goBtn.disabled = !enabled
  fillBtn.disabled = !enabled
  submitJobBtn.disabled = !enabled
  // Upload buttons have their own enable logic based on file input and document selection
  updateUploadButtonsState()
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

  try {
    const result = await api.getJobMatches({ limit: 50, status: "active" })

    if (result.success && Array.isArray(result.data)) {
      jobMatches = result.data
      renderJobList()
    } else {
      jobMatches = []
      jobList.innerHTML = `<div class="empty-placeholder">${result.message || "Failed to load job matches"}</div>`
    }
  } catch (err) {
    jobMatches = []
    const message = err instanceof Error ? err.message : String(err)
    jobList.innerHTML = `<div class="empty-placeholder">Error: ${message}</div>`
    console.error("Failed to load job matches:", err)
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
      <div class="job-item${isSelected ? " selected" : ""}" data-id="${escapeAttr(match.id ?? "")}">
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
// If autoSelectId is provided, auto-select that document
// Otherwise, auto-select the most recent completed document
async function loadDocuments(jobMatchId: string, autoSelectId?: string) {
  documentsList.innerHTML = '<div class="loading-placeholder">Loading...</div>'

  try {
    const result = await api.getDocuments(jobMatchId)

    if (result.success && Array.isArray(result.data)) {
      documents = result.data

      // Auto-select logic:
      // 1. If autoSelectId provided (e.g., newly generated), select it
      // 2. Otherwise, select the most recent completed document
      // 3. Documents are already sorted by createdAt desc from API
      if (autoSelectId) {
        selectedDocumentId = documents.find((d) => d.id === autoSelectId)?.id || null
      } else if (!selectedDocumentId) {
        // Find most recent completed document
        const completed = documents.find((d) => d.status === "completed")
        selectedDocumentId = completed?.id || null
      }

      renderDocumentsList()
      updateUploadButtonsState()
    } else {
      documents = []
      selectedDocumentId = null
      documentsList.innerHTML = `<div class="empty-placeholder">${result.message || "No documents"}</div>`
      updateUploadButtonsState()
    }
  } catch (err) {
    documents = []
    selectedDocumentId = null
    const message = err instanceof Error ? err.message : String(err)
    documentsList.innerHTML = `<div class="empty-placeholder">Error: ${message}</div>`
    console.error("Failed to load documents:", err)
    updateUploadButtonsState()
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
    btn.addEventListener("click", async (e) => {
      e.stopPropagation()
      const url = (btn as HTMLElement).dataset.url
      if (url) {
        const result = await api.openDocument(url)
        if (!result.success) {
          console.error("[app.ts] Failed to open document:", result.message)
        }
      }
    })
  })
}

// Select a document
function selectDocument(id: string) {
  selectedDocumentId = selectedDocumentId === id ? null : id // Toggle selection
  renderDocumentsList()
  updateUploadButtonsState()
}

// Get the currently selected document
function getSelectedDocument(): DocumentInfo | null {
  if (!selectedDocumentId) return null
  return documents.find((d) => d.id === selectedDocumentId) || null
}

// Update upload buttons enabled state based on requirements:
// 1. File input must exist on page
// 2. A document must be selected
// 3. The document must have the appropriate file (resumeUrl or coverLetterUrl)
function updateUploadButtonsState() {
  const doc = getSelectedDocument()
  const canUploadResume = hasFileInput && doc?.resumeUrl
  const canUploadCover = hasFileInput && doc?.coverLetterUrl

  uploadResumeBtn.disabled = !canUploadResume
  uploadCoverBtn.disabled = !canUploadCover

  // Update status message
  if (!hasFileInput) {
    uploadStatus.className = "upload-status warning"
    uploadStatusText.textContent = "No file input detected on page"
  } else if (!doc) {
    uploadStatus.className = "upload-status info"
    uploadStatusText.textContent = "Select a document to upload"
  } else {
    uploadStatus.className = "upload-status ready"
    const available: string[] = []
    if (doc.resumeUrl) available.push("Resume")
    if (doc.coverLetterUrl) available.push("Cover Letter")
    uploadStatusText.textContent = available.length > 0 ? `Ready: ${available.join(", ")}` : "No files generated yet"
  }

  // Update button titles for better UX
  if (!hasFileInput) {
    uploadResumeBtn.title = "Navigate to a page with file upload"
    uploadCoverBtn.title = "Navigate to a page with file upload"
  } else if (!doc) {
    uploadResumeBtn.title = "Select a document first"
    uploadCoverBtn.title = "Select a document first"
  } else {
    uploadResumeBtn.title = doc.resumeUrl ? "Upload resume to file input" : "No resume generated"
    uploadCoverBtn.title = doc.coverLetterUrl ? "Upload cover letter to file input" : "No cover letter generated"
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

  // Prevent concurrent generations - atomic check and set
  if (isGenerating) {
    setStatus("Generation already in progress", "error")
    return
  }
  isGenerating = true

  try {
    // Show generation progress UI
    generationProgress.classList.remove("hidden")
    generationSteps.innerHTML = '<div class="loading-placeholder">Starting generation...</div>'
    setStatus("Generating documents...", "loading")
    generateBtn.disabled = true

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
      selectedJobMatchId = match.id ?? null
      selectedDocumentId = null
      renderJobList()

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
        console.warn("No match.id found; skipping document load.")
        generateBtn.disabled = true
        setStatus("Matched job has no id; cannot load documents", "error")
      }
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

  setButtonsEnabled(false)
  setStatus("Loading...", "loading")

  const navResult = await api.navigate(fullUrl)

  if (navResult.success) {
    setStatus("Page loaded", "success")

    // Check if this URL matches any job match
    await checkUrlForJobMatch(fullUrl)

    // Check for file input on the new page (with delay for page to render)
    setTimeout(checkForFileInput, 500)
  } else {
    setStatus(navResult.message || "Navigation failed", "error")
  }

  setButtonsEnabled(true)
}

// Track form fill progress subscription
let unsubscribeFormFillProgress: (() => void) | null = null

// Handle form fill progress updates
function handleFormFillProgress(progress: FormFillProgress) {
  // Update status message based on phase
  if (progress.phase === "failed") {
    setStatus(progress.message, "error")
    hideFormFillProgress()
    return
  }

  if (progress.phase === "completed") {
    if (progress.summary) {
      renderFillResults(progress.summary)
    }
    setStatus(progress.message, "success")
    hideFormFillProgress()
    setWorkflowStep("fill", "completed")
    setWorkflowStep("submit", "active")
    return
  }

  // Show progress UI
  showFormFillProgress(progress)
}

// Show form fill progress UI
function showFormFillProgress(progress: FormFillProgress) {
  let progressHtml = ""
  const safeMessage = escapeHtml(progress.message)

  if (progress.phase === "starting") {
    progressHtml = `
      <div class="fill-progress">
        <div class="fill-phase">${safeMessage}</div>
        <div class="fill-spinner"></div>
      </div>
    `
  } else if (progress.phase === "ai-processing") {
    // Parse streaming text to show field count and last few fields being processed
    let streamingInfo = ""
    if (progress.streamingText) {
      // Count how many complete field objects we can see
      const fieldMatches = progress.streamingText.match(/"selector":/g)
      const fieldCount = fieldMatches ? fieldMatches.length : 0

      // Extract the last few field labels for display
      const labelMatches = progress.streamingText.match(/"label":\s*"([^"]+)"/g)
      const lastLabels = labelMatches
        ? labelMatches.slice(-3).map((m) => m.match(/"label":\s*"([^"]+)"/)?.[1] || "").filter(Boolean)
        : []

      const charCount = progress.streamingText.length
      // Escape labels to prevent XSS from malicious form field names
      const safeLabels = lastLabels.map((l) => escapeHtml(l)).join(", ")
      streamingInfo = `
        <div class="streaming-info">
          <div class="streaming-stat"><span class="stat-value">${fieldCount}</span> fields analyzed</div>
          <div class="streaming-stat"><span class="stat-value">${Math.round(charCount / 1024)}KB</span> received</div>
          ${lastLabels.length > 0 ? `<div class="streaming-recent">Recent: ${safeLabels}</div>` : ""}
        </div>
      `
    }

    progressHtml = `
      <div class="fill-progress">
        <div class="fill-phase">${safeMessage}</div>
        ${progress.isStreaming ? '<div class="fill-spinner"></div>' : ""}
        ${streamingInfo}
      </div>
    `
  } else if (progress.phase === "filling") {
    const percent = progress.totalFields
      ? Math.round(((progress.processedFields || 0) / progress.totalFields) * 100)
      : 0

    progressHtml = `
      <div class="fill-progress">
        <div class="fill-phase">${safeMessage}</div>
        <div class="fill-progress-bar">
          <div class="fill-progress-fill" style="width: ${percent}%"></div>
        </div>
        <div class="fill-progress-text">${progress.processedFields || 0} / ${progress.totalFields || 0} fields</div>
      </div>
    `
  }

  fillOutput.innerHTML = progressHtml
  setStatus(progress.message, "loading")
}

// Hide form fill progress UI
function hideFormFillProgress() {
  // Progress UI is replaced by results or cleared on error
}

// Escape HTML to prevent XSS in streaming preview
function escapeHtml(text: string): string {
  const div = document.createElement("div")
  div.textContent = text
  return div.innerHTML
}

// Fill form with AI
async function fillForm() {
  const provider = providerSelect.value as "claude" | "codex" | "gemini"

  try {
    setButtonsEnabled(false)
    setStatus(`Filling form with ${provider}...`, "loading")
    setWorkflowStep("fill", "active")

    // Clean up any existing subscription before creating a new one
    if (unsubscribeFormFillProgress) {
      unsubscribeFormFillProgress()
      unsubscribeFormFillProgress = null
    }

    // Subscribe to progress events
    unsubscribeFormFillProgress = api.onFormFillProgress(handleFormFillProgress)

    const result = await api.fillForm({
      provider,
      jobMatchId: selectedJobMatchId || undefined,
      documentId: selectedDocumentId || undefined,
    })

    // Unsubscribe from progress events
    if (unsubscribeFormFillProgress) {
      unsubscribeFormFillProgress()
      unsubscribeFormFillProgress = null
    }

    // Handle result (progress events should have already updated UI)
    if (result.success && result.data) {
      renderFillResults(result.data)
      setStatus(`Filled ${result.data.filledCount}/${result.data.totalFields} fields`, "success")
      setWorkflowStep("fill", "completed")
      setWorkflowStep("submit", "active")
    } else if (!result.success) {
      setStatus(result.message || "Fill failed", "error")
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    setStatus(`Fill failed: ${message}`, "error")
  } finally {
    // Clean up subscription
    if (unsubscribeFormFillProgress) {
      unsubscribeFormFillProgress()
      unsubscribeFormFillProgress = null
    }
    setButtonsEnabled(true)
  }
}

// Render fill results in sidebar
function renderFillResults(summary: FormFillSummary) {
  const hasSkipped = summary.skippedFields.length > 0

  fillOutput.innerHTML = `
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
  fillOutput.scrollIntoView({ behavior: "smooth" })
}

// Upload document (resume or cover letter)
async function uploadDocument(type: "resume" | "coverLetter") {
  if (!selectedDocumentId) {
    setStatus("Select a document first", "error")
    return
  }

  const typeLabel = type === "coverLetter" ? "cover letter" : "resume"

  try {
    setButtonsEnabled(false)
    setStatus(`Uploading ${typeLabel}...`, "loading")

    const result = await api.uploadResume({ documentId: selectedDocumentId, type })

    if (result.success) {
      setStatus(result.message, "success")
    } else {
      setStatus(result.message, "error")
      if (result.filePath) {
        console.log("Manual upload path:", result.filePath)
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

// Utility: escape for HTML attributes (escapes quotes)
function escapeAttr(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

// Initialize application when DOM is ready
function initializeApp() {
  // Event listeners - Toolbar
  goBtn.addEventListener("click", navigate)
  urlInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      navigate()
    }
  })
  fillBtn.addEventListener("click", fillForm)
  submitJobBtn.addEventListener("click", submitJob)

  // Event listeners - Sidebar
  generateBtn.addEventListener("click", generateDocument)
  markAppliedBtn.addEventListener("click", markAsApplied)
  markIgnoredBtn.addEventListener("click", markAsIgnored)
  uploadResumeBtn.addEventListener("click", uploadResumeFile)
  uploadCoverBtn.addEventListener("click", uploadCoverLetterFile)
  rescanBtn.addEventListener("click", checkForFileInput)

  // Run async initialization
  init()
}

// Initialize
async function init() {
  setStatus("Ready")

  // Initialize workflow progress
  updateWorkflowProgress()

  // Initialize upload button state
  updateUploadButtonsState()

  // Load job matches on startup (sidebar is always visible)
  await loadJobMatches()
}

// Cleanup on page unload to prevent memory leaks
window.addEventListener("beforeunload", () => {
  cleanupGenerationProgressListener()
})

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
