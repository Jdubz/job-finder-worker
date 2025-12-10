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

interface ElectronAPI {
  navigate: (url: string) => Promise<void>
  getUrl: () => Promise<string>
  fillForm: (provider: "claude" | "codex" | "gemini") => Promise<{ success: boolean; message: string }>
  fillFormEnhanced: (options: {
    provider: "claude" | "codex" | "gemini"
    jobMatchId?: string
    documentId?: string
  }) => Promise<{ success: boolean; data?: FormFillSummary; message?: string }>
  uploadResume: () => Promise<{ success: boolean; message: string }>
  submitJob: (provider: "claude" | "codex" | "gemini") => Promise<{ success: boolean; message: string }>
  setSidebarState: (open: boolean) => Promise<void>
  getSidebarState: () => Promise<{ open: boolean }>
  getJobMatches: (options?: { limit?: number; status?: string }) => Promise<{
    success: boolean
    data?: JobMatchListItem[]
    message?: string
  }>
  getJobMatch: (id: string) => Promise<{ success: boolean; data?: unknown; message?: string }>
  getDocuments: (jobMatchId: string) => Promise<{
    success: boolean
    data?: DocumentInfo[]
    message?: string
  }>
  startGeneration: (options: {
    jobMatchId: string
    type: "resume" | "coverLetter" | "both"
  }) => Promise<{ success: boolean; requestId?: string; message?: string }>
}

// Extend Window interface - with safety check for missing preload
const maybeAPI = (window as unknown as { electronAPI?: ElectronAPI }).electronAPI
if (!maybeAPI) {
  throw new Error("Electron API not available. Preload script may have failed to load.")
}
const electronAPI: ElectronAPI = maybeAPI

// State
let sidebarOpen = false
let selectedJobMatchId: string | null = null
let selectedDocumentId: string | null = null
let jobMatches: JobMatchListItem[] = []
let documents: DocumentInfo[] = []

// DOM elements - Toolbar
const urlInput = document.getElementById("urlInput") as HTMLInputElement
const goBtn = document.getElementById("goBtn") as HTMLButtonElement
const providerSelect = document.getElementById("providerSelect") as HTMLSelectElement
const fillBtn = document.getElementById("fillBtn") as HTMLButtonElement
const uploadBtn = document.getElementById("uploadBtn") as HTMLButtonElement
const submitJobBtn = document.getElementById("submitJobBtn") as HTMLButtonElement
const statusEl = document.getElementById("status") as HTMLSpanElement
const sidebarToggle = document.getElementById("sidebarToggle") as HTMLButtonElement

// DOM elements - Sidebar
const sidebar = document.getElementById("sidebar") as HTMLDivElement
const jobList = document.getElementById("jobList") as HTMLDivElement
const documentsList = document.getElementById("documentsList") as HTMLDivElement
const generateBtn = document.getElementById("generateBtn") as HTMLButtonElement
const resultsContent = document.getElementById("resultsContent") as HTMLDivElement

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

// Sidebar toggle
async function toggleSidebar() {
  sidebarOpen = !sidebarOpen
  sidebar.classList.toggle("open", sidebarOpen)
  await electronAPI.setSidebarState(sidebarOpen)

  // Load job matches when opening sidebar for the first time
  if (sidebarOpen && jobMatches.length === 0) {
    await loadJobMatches()
  }
}

// Load job matches from backend
async function loadJobMatches() {
  jobList.innerHTML = '<div class="loading-placeholder">Loading...</div>'

  const result = await electronAPI.getJobMatches({ limit: 50, status: "active" })

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
      return `
      <div class="job-item${isSelected ? " selected" : ""}" data-id="${escapeAttr(match.id)}">
        <div class="job-title">${escapeHtml(match.listing.title)}</div>
        <div class="job-company">${escapeHtml(match.listing.companyName)}</div>
        <div class="job-score ${scoreClass}">${match.matchScore}% match</div>
      </div>
    `
    })
    .join("")

  // Add click handlers
  jobList.querySelectorAll(".job-item").forEach((el) => {
    el.addEventListener("click", () => selectJobMatch((el as HTMLElement).dataset.id!))
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

  // Load the job URL in BrowserView
  setStatus("Loading job listing...", "loading")
  try {
    await electronAPI.navigate(match.listing.url)
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

  const result = await electronAPI.getDocuments(jobMatchId)

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
      selectDocument((el as HTMLElement).dataset.id!)
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

// Generate new document
async function generateDocument() {
  if (!selectedJobMatchId) {
    setStatus("Select a job match first", "error")
    return
  }

  // For simplicity, generate both resume and cover letter
  setStatus("Starting document generation...", "loading")
  generateBtn.disabled = true

  const result = await electronAPI.startGeneration({
    jobMatchId: selectedJobMatchId,
    type: "both",
  })

  if (result.success) {
    setStatus(`Generation started (ID: ${result.requestId})`, "success")
    // Reload documents after a delay
    setTimeout(() => loadDocuments(selectedJobMatchId!), 3000)
  } else {
    setStatus(result.message || "Generation failed", "error")
  }

  generateBtn.disabled = false
}

// Navigate to URL
async function navigate() {
  const url = urlInput.value.trim()
  if (!url) {
    setStatus("Enter a URL", "error")
    return
  }

  // Add https:// if no protocol
  const fullUrl = url.startsWith("http") ? url : `https://${url}`

  try {
    setButtonsEnabled(false)
    setStatus("Loading...", "loading")
    await electronAPI.navigate(fullUrl)
    setStatus("Page loaded", "success")
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

    // Use enhanced fill if we have a job match selected
    if (selectedJobMatchId) {
      const result = await electronAPI.fillFormEnhanced({
        provider,
        jobMatchId: selectedJobMatchId,
        documentId: selectedDocumentId || undefined,
      })

      if (result.success && result.data) {
        renderFillResults(result.data)
        setStatus(`Filled ${result.data.filledCount}/${result.data.totalFields} fields`, "success")
      } else {
        setStatus(result.message || "Fill failed", "error")
      }
    } else {
      // Fall back to basic fill
      const result = await electronAPI.fillForm(provider)

      if (result.success) {
        setStatus(result.message, "success")
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

  // Open sidebar to show results if not already open
  if (!sidebarOpen) {
    toggleSidebar()
  }

  // Scroll to results
  resultsContent.scrollIntoView({ behavior: "smooth" })
}

// Upload resume
async function uploadResume() {
  try {
    setButtonsEnabled(false)
    setStatus("Uploading resume...", "loading")
    const result = await electronAPI.uploadResume()

    if (result.success) {
      setStatus(result.message, "success")
    } else {
      setStatus(result.message, "error")
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
    const result = await electronAPI.submitJob(provider)

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

// Event listeners
sidebarToggle.addEventListener("click", toggleSidebar)
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

// Initialize
async function init() {
  setStatus("Ready")

  // Check if sidebar was previously open
  const state = await electronAPI.getSidebarState()
  if (state.open) {
    sidebarOpen = true
    sidebar.classList.add("open")
    await loadJobMatches()
  }
}

init()
