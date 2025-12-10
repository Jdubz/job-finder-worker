import { app, BrowserWindow, BrowserView, ipcMain, IpcMainInvokeEvent, globalShortcut, Menu } from "electron"
import { spawn } from "child_process"
import * as path from "path"
import * as fs from "fs"
import * as os from "os"
import { logger } from "./logger.js"

// Disable GPU acceleration to fix DevTools issues on Linux
app.disableHardwareAcceleration()
app.commandLine.appendSwitch("disable-gpu")
app.commandLine.appendSwitch("disable-software-rasterizer")

logger.info("Main process starting...")

// Listen for renderer console logs and forward to main process logger
ipcMain.on("renderer-log", (_event, level: string, args: unknown[]) => {
  const message = args.map(a => typeof a === "object" ? JSON.stringify(a) : String(a)).join(" ")
  const prefix = "[RENDERER]"
  switch (level) {
    case "warn":
      logger.warn(prefix, message)
      break
    case "error":
      logger.error(prefix, message)
      break
    default:
      logger.info(prefix, message)
  }
})

// Import shared types and utilities
import type {
  CliProvider,
  PersonalInfo,
  ContentItem,
  FormField,
  FillInstruction,
  EnhancedFillInstruction,
  FormFillSummary,
  JobExtraction,
  GenerationStep,
  GenerationProgress,
} from "./types.js"
import type {
  ApiResponse,
  ApiErrorResponse,
  JobMatchWithListing,
  ListJobMatchesResponse,
} from "@shared/types"
import {
  normalizeUrl,
  resolveDocumentPath,
  buildPrompt,
  buildEnhancedPrompt,
  buildExtractionPrompt,
} from "./utils.js"

// Configuration from environment
// The API URL defaults to localhost:3000 which connects to the local development server.
// The server's firebase-auth middleware always bypasses authentication for localhost requests.
const API_URL = process.env.JOB_FINDER_API_URL || "http://localhost:3000/api"
// Artifacts directory - must match backend's GENERATOR_ARTIFACTS_DIR
const ARTIFACTS_DIR = process.env.GENERATOR_ARTIFACTS_DIR || "/data/artifacts"

// Helper to create fetch options
function fetchOptions(options: RequestInit = {}): RequestInit {
  const headers = new Headers(options.headers)
  headers.set("Content-Type", "application/json")
  return { ...options, headers }
}

// Note: HTTP is expected for localhost API (localhost:3000) - it's secure because
// the port is only bound to 127.0.0.1 and the backend explicitly trusts same-host traffic

// Layout constants
const TOOLBAR_HEIGHT = 60
const SIDEBAR_WIDTH = 300

// CLI timeout constant
const CLI_TIMEOUT_MS = 60000

// Maximum steps for generation workflow (prevent infinite loops)
const MAX_GENERATION_STEPS = 20

// Global state
let mainWindow: BrowserWindow | null = null
let browserView: BrowserView | null = null

// Update BrowserView bounds (sidebar is always visible, offset by SIDEBAR_WIDTH)
function updateBrowserViewBounds(): void {
  if (!browserView || !mainWindow) return
  const bounds = mainWindow.getBounds()
  browserView.setBounds({
    x: SIDEBAR_WIDTH,
    y: TOOLBAR_HEIGHT,
    width: bounds.width - SIDEBAR_WIDTH,
    height: bounds.height - TOOLBAR_HEIGHT,
  })
}

// Form extraction script - injected into page
const EXTRACT_FORM_SCRIPT = `
(() => {
  const inputs = document.querySelectorAll('input, select, textarea')
  return Array.from(inputs).map(el => {
    // Build selector: prefer id, then name, then data-testid
    const selector = el.id ? '#' + CSS.escape(el.id)
      : el.name ? '[name="' + CSS.escape(el.name) + '"]'
      : el.dataset.testid ? '[data-testid="' + CSS.escape(el.dataset.testid) + '"]'
      : null

    // Find label: check label[for], aria-label, aria-labelledby
    const forLabel = el.id && document.querySelector('label[for="' + CSS.escape(el.id) + '"]')
    const ariaLabel = el.getAttribute('aria-label')
    const ariaLabelledBy = el.getAttribute('aria-labelledby')
    const labelledByEl = ariaLabelledBy && document.getElementById(ariaLabelledBy)

    // Extract options for select elements
    const options = el.tagName.toLowerCase() === 'select'
      ? Array.from(el.options).map(opt => ({ value: opt.value, text: opt.textContent?.trim() }))
      : null

    return {
      selector,
      type: el.type || el.tagName.toLowerCase(),
      label: forLabel?.textContent?.trim() || ariaLabel || labelledByEl?.textContent?.trim() || null,
      placeholder: el.placeholder || null,
      required: el.required || false,
      options
    }
  }).filter(f => f.selector && f.type !== 'hidden' && f.type !== 'submit' && f.type !== 'button')
})()
`

async function createWindow(): Promise<void> {
  logger.info("Creating main window...")
  const preloadPath = path.join(import.meta.dirname, "preload.cjs")
  logger.info("Preload path:", preloadPath)
  logger.info("Preload exists:", fs.existsSync(preloadPath))

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  logger.info("Main window created")

  // Create BrowserView for job application pages
  browserView = new BrowserView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.setBrowserView(browserView)

  // Position BrowserView below toolbar, accounting for sidebar state
  updateBrowserViewBounds()
  browserView.setAutoResize({ width: true, height: true })

  // Capture renderer console messages and errors BEFORE loading HTML
  mainWindow.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    const levelName = ["verbose", "info", "warning", "error"][level] || "unknown"
    logger.info(`[RENDERER:${levelName}] ${message} (${sourceId}:${line})`)
  })

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription) => {
    logger.error(`[RENDERER] Failed to load: ${errorCode} - ${errorDescription}`)
  })

  mainWindow.webContents.on("preload-error", (_event, preloadPath, error) => {
    logger.error(`[PRELOAD ERROR] ${preloadPath}: ${error}`)
  })

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    logger.error(`[RENDERER] Process gone:`, details)
  })

  // Load the renderer UI (toolbar)
  const htmlPath = path.join(import.meta.dirname, "renderer", "index.html")
  logger.info("Loading HTML:", htmlPath)
  logger.info("HTML exists:", fs.existsSync(htmlPath))

  try {
    await mainWindow.loadFile(htmlPath)
    logger.info("HTML loaded successfully")
  } catch (err) {
    // ERR_ABORTED can happen during hot reload - retry once
    if (err instanceof Error && err.message.includes("ERR_ABORTED")) {
      logger.info("Load aborted during hot reload, retrying...")
      await new Promise(resolve => setTimeout(resolve, 100))
      await mainWindow.loadFile(htmlPath)
    } else {
      logger.error("Failed to load HTML:", err)
      throw err
    }
  }

  // Open DevTools in development for debugging
  if (process.env.NODE_ENV !== "production") {
    logger.info("Opening DevTools...")
    mainWindow.webContents.openDevTools({ mode: "detach" })
  }

  mainWindow.on("closed", () => {
    mainWindow = null
    browserView = null
  })

  mainWindow.on("resize", () => {
    updateBrowserViewBounds()
  })

  // Keyboard shortcuts for DevTools
  // Ctrl+Shift+I = Main window (sidebar) DevTools
  // Ctrl+Shift+J = BrowserView (web page) DevTools
  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (input.control && input.shift && input.key.toLowerCase() === "i") {
      event.preventDefault()
      mainWindow?.webContents.toggleDevTools()
    }
    if (input.control && input.shift && input.key.toLowerCase() === "j") {
      event.preventDefault()
      browserView?.webContents.toggleDevTools()
    }
  })
}

// Navigate to URL
ipcMain.handle("navigate", async (_event: IpcMainInvokeEvent, url: string): Promise<void> => {
  if (!browserView) throw new Error("BrowserView not initialized")
  await browserView.webContents.loadURL(url)
})

// Get current URL
ipcMain.handle("get-url", async (): Promise<string> => {
  if (!browserView) return ""
  return browserView.webContents.getURL()
})

// Fill form with AI
ipcMain.handle(
  "fill-form",
  async (_event: IpcMainInvokeEvent, provider: CliProvider): Promise<{ success: boolean; message: string }> => {
    try {
      if (!browserView) throw new Error("BrowserView not initialized")

      // 1. Get profile and work history from job-finder backend
      logger.info("Fetching profile from backend...")
      const [profileRes, contentRes] = await Promise.all([
        fetch(`${API_URL}/config/personal-info`, fetchOptions()),
        fetch(`${API_URL}/content-items?limit=100`, fetchOptions())
      ])
      if (!profileRes.ok) {
        throw new Error(`Failed to fetch profile: ${profileRes.status}`)
      }
      const profileData = await profileRes.json()
      const profile: PersonalInfo = profileData.data || profileData

      // Validate required profile fields
      if (!profile.name || !profile.email) {
        throw new Error("Profile missing required fields (name, email). Please configure your profile first.")
      }

      // Parse work history (optional - don't fail if unavailable)
      let workHistory: ContentItem[] = []
      if (contentRes.ok) {
        const contentData = await contentRes.json()
        workHistory = contentData.data || []
        logger.info(`Fetched ${workHistory.length} work history items`)
      }

      // 2. Extract form fields from page
      logger.info("Extracting form fields...")
      const fields: FormField[] = await browserView.webContents.executeJavaScript(EXTRACT_FORM_SCRIPT)
      logger.info(`Found ${fields.length} form fields`)

      if (fields.length === 0) {
        return { success: false, message: "No form fields found on page" }
      }

      // 3. Build prompt and call CLI
      logger.info(`Calling ${provider} CLI for field mapping...`)
      const prompt = buildPrompt(fields, profile, workHistory)
      const instructions = await runCli(provider, prompt)
      logger.info(`Got ${instructions.length} fill instructions`)

      // 4. Fill fields using executeJavaScript
      logger.info("Filling form fields...")
      let filledCount = 0
      for (const instruction of instructions) {
        try {
          const safeSelector = JSON.stringify(instruction.selector)
          const safeValue = JSON.stringify(instruction.value)
          const filled = await browserView.webContents.executeJavaScript(`
            (() => {
              const el = document.querySelector(${safeSelector});
              if (!el) return false;
              if (el.tagName.toLowerCase() === 'select') {
                el.value = ${safeValue};
                el.dispatchEvent(new Event('change', { bubbles: true }));
              } else {
                el.value = ${safeValue};
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
              }
              return true;
            })()
          `)
          if (filled) filledCount++
        } catch (err) {
          logger.warn(`Failed to fill ${instruction.selector}:`, err)
        }
      }

      return {
        success: true,
        message: `Filled ${filledCount}/${instructions.length} fields`,
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error("Fill form error:", message)
      return { success: false, message }
    }
  }
)

// Helper function to set files on a file input using Electron's debugger API
async function setFileInputFiles(webContents: Electron.WebContents, selector: string, filePaths: string[]): Promise<void> {
  const debugger_ = webContents.debugger

  try {
    debugger_.attach("1.3")
  } catch (err) {
    // Already attached is fine
    if (!(err instanceof Error && err.message.includes("Already attached"))) {
      throw err
    }
  }

  try {
    // Get the document
    const { root } = await debugger_.sendCommand("DOM.getDocument", {})

    // Find the file input element
    const { nodeId } = await debugger_.sendCommand("DOM.querySelector", {
      nodeId: root.nodeId,
      selector: selector,
    })

    if (!nodeId) {
      throw new Error(`File input not found: ${selector}`)
    }

    // Set the files on the input
    await debugger_.sendCommand("DOM.setFileInputFiles", {
      nodeId: nodeId,
      files: filePaths,
    })
  } finally {
    try {
      debugger_.detach()
    } catch (err) {
      // Log detach errors for debugging (may be expected if target is already closed)
      logger.warn("Failed to detach debugger, this may be expected:", err)
    }
  }
}

// Upload resume/document to form using Electron's debugger API (CDP)
ipcMain.handle(
  "upload-resume",
  async (
    _event: IpcMainInvokeEvent,
    options?: { documentId?: string; type?: "resume" | "coverLetter" }
  ): Promise<{ success: boolean; message: string; filePath?: string }> => {
    let resolvedPath: string | null = null

    try {
      if (!browserView) throw new Error("BrowserView not initialized")

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
        return { success: false, message: "No file input found on page" }
      }

      // Resolve file path from document or fallback to env var
      if (options?.documentId) {
        // Validate documentId format (UUID v4 pattern)
        const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
        if (!uuidPattern.test(options.documentId)) {
          return { success: false, message: "Invalid document ID format" }
        }

        // Fetch document details from backend
        const docRes = await fetch(`${API_URL}/generator/requests/${options.documentId}`, fetchOptions())
        if (!docRes.ok) {
          logger.error(`Failed to fetch document: ${docRes.status} for documentId: ${options.documentId}`)
          return { success: false, message: `Failed to fetch document: ${docRes.status}` }
        }
        const docData = await docRes.json()
        const doc = docData.data || docData

        // Get the appropriate URL based on type
        const docType = options.type || "resume"
        const docUrl = docType === "coverLetter" ? doc.coverLetterUrl : doc.resumeUrl

        if (!docUrl) {
          return {
            success: false,
            message: `No ${docType} file found for this document. Generate one first.`,
          }
        }

        resolvedPath = resolveDocumentPath(docUrl, ARTIFACTS_DIR)
      } else {
        // Fallback to RESUME_PATH environment variable
        resolvedPath = process.env.RESUME_PATH || path.join(os.homedir(), "resume.pdf")
      }

      if (!fs.existsSync(resolvedPath)) {
        return {
          success: false,
          message: `File not found at ${resolvedPath}`,
          filePath: resolvedPath,
        }
      }

      // Use Electron's debugger API to set the file
      logger.info(`Uploading file: ${resolvedPath} to ${fileInputSelector}`)
      await setFileInputFiles(browserView.webContents, fileInputSelector, [resolvedPath])

      const docTypeLabel = options?.type === "coverLetter" ? "Cover letter" : "Resume"
      return { success: true, message: `${docTypeLabel} uploaded successfully`, filePath: resolvedPath }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error("Upload error:", message)
      return {
        success: false,
        message: resolvedPath ? `Upload failed: ${message}. File path: ${resolvedPath}` : message,
        filePath: resolvedPath || undefined,
      }
    }
  }
)

// Submit job listing for analysis
ipcMain.handle(
  "submit-job",
  async (_event: IpcMainInvokeEvent, provider: CliProvider): Promise<{ success: boolean; message: string }> => {
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

      // 3. Use AI CLI to extract job details
      logger.info(`Calling ${provider} CLI for job extraction...`)
      const extractPrompt = buildExtractionPrompt(pageContent, url)
      const extracted = await runCliForExtraction(provider, extractPrompt)
      logger.info("Extracted job details:", extracted)

      // 4. Submit to backend API with bypassFilter
      logger.info("Submitting job to queue...")
      const res = await fetch(`${API_URL}/queue/jobs`, fetchOptions({
        method: "POST",
        body: JSON.stringify({
          url,
          title: extracted.title,
          description: extracted.description,
          location: extracted.location,
          techStack: extracted.techStack,
          companyName: extracted.companyName,
          bypassFilter: true,
          source: "user_submission",
        }),
      }))

      if (!res.ok) {
        const errorText = await res.text()
        return { success: false, message: `API error (${res.status}): ${errorText.slice(0, 100)}` }
      }

      const result = await res.json()
      const queueId = result.data?.id || result.id || "unknown"
      return { success: true, message: `Job submitted (queue ID: ${queueId})` }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error("Submit job error:", message)
      return { success: false, message }
    }
  }
)

// CDP connection status - always available now using native Electron debugger
ipcMain.handle("get-cdp-status", async (): Promise<{ connected: boolean; message?: string }> => {
  return { connected: true }
})

// Check if a file input exists on the current page
ipcMain.handle("check-file-input", async (): Promise<{ hasFileInput: boolean; selector?: string }> => {
  if (!browserView) {
    return { hasFileInput: false }
  }

  try {
    const result = await browserView.webContents.executeJavaScript(`
      (() => {
        const fileInput = document.querySelector('input[type="file"]');
        if (!fileInput) return { hasFileInput: false };
        let selector = 'input[type="file"]';
        if (fileInput.id) selector = '#' + CSS.escape(fileInput.id);
        else if (fileInput.name) selector = 'input[type="file"][name="' + CSS.escape(fileInput.name) + '"]';
        return { hasFileInput: true, selector };
      })()
    `)
    return result
  } catch {
    return { hasFileInput: false }
  }
})

// Get job matches from backend
ipcMain.handle(
  "get-job-matches",
  async (
    _event: IpcMainInvokeEvent,
    options?: { limit?: number; status?: string }
  ): Promise<{ success: boolean; data?: JobMatchWithListing[]; message?: string }> => {
    try {
      const limit = options?.limit || 50
      const status = options?.status || "active"
      const res = await fetch(`${API_URL}/job-matches/?limit=${limit}&status=${status}&sortBy=updated&sortOrder=desc`, fetchOptions())

      const json = await res.json() as ApiResponse<ListJobMatchesResponse> | ApiErrorResponse

      if (!res.ok || !json.success) {
        const errorJson = json as ApiErrorResponse
        return {
          success: false,
          message: errorJson.error?.message || `Failed to fetch job matches: ${res.status}`,
        }
      }

      const successJson = json as ApiResponse<ListJobMatchesResponse> & { success: true }
      return { success: true, data: successJson.data.matches }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { success: false, message }
    }
  }
)

// Get single job match with full details
ipcMain.handle(
  "get-job-match",
  async (_event: IpcMainInvokeEvent, id: string): Promise<{ success: boolean; data?: unknown; message?: string }> => {
    try {
      const res = await fetch(`${API_URL}/job-matches/${id}`, fetchOptions())
      if (!res.ok) {
        return { success: false, message: `Failed to fetch job match: ${res.status}` }
      }
      const data = await res.json()
      return { success: true, data: data.data || data }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { success: false, message }
    }
  }
)

// Get documents for a job match
ipcMain.handle(
  "get-documents",
  async (_event: IpcMainInvokeEvent, jobMatchId: string): Promise<{ success: boolean; data?: unknown[]; message?: string }> => {
    try {
      const res = await fetch(`${API_URL}/generator/job-matches/${jobMatchId}/documents`, fetchOptions())
      if (!res.ok) {
        // 404 is fine - means no documents yet
        if (res.status === 404) {
          return { success: true, data: [] }
        }
        return { success: false, message: `Failed to fetch documents: ${res.status}` }
      }
      const data = await res.json()
      return { success: true, data: data.data || data || [] }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { success: false, message }
    }
  }
)

// Update job match status (mark as applied, ignored, etc.)
ipcMain.handle(
  "update-job-match-status",
  async (
    _event: IpcMainInvokeEvent,
    options: { id: string; status: "active" | "ignored" | "applied" }
  ): Promise<{ success: boolean; message?: string }> => {
    try {
      const res = await fetch(`${API_URL}/job-matches/${options.id}/status`, fetchOptions({
        method: "PATCH",
        body: JSON.stringify({ status: options.status }),
      }))
      if (!res.ok) {
        const errorText = await res.text()
        return { success: false, message: `Failed to update status: ${errorText.slice(0, 100)}` }
      }
      return { success: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { success: false, message }
    }
  }
)

// Find job match by URL (for auto-detection)
ipcMain.handle(
  "find-job-match-by-url",
  async (
    _event: IpcMainInvokeEvent,
    url: string
  ): Promise<{ success: boolean; data?: unknown; message?: string }> => {
    try {
      // Normalize the URL for comparison
      const normalizedUrl = normalizeUrl(url)

      // Fetch recent job matches and compare URLs
      const res = await fetch(`${API_URL}/job-matches/?limit=100&sortBy=updated&sortOrder=desc`, fetchOptions())
      if (!res.ok) {
        return { success: false, message: `Failed to fetch job matches: ${res.status}` }
      }
      const data = await res.json()
      const matches = data.data || data || []

      // Find a match where the listing URL matches (normalized)
      for (const match of matches) {
        if (match.listing?.url && normalizeUrl(match.listing.url) === normalizedUrl) {
          return { success: true, data: match }
        }
      }

      return { success: true, data: null } // No match found
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { success: false, message }
    }
  }
)

// Start document generation (simple - returns requestId only)
ipcMain.handle(
  "start-generation",
  async (
    _event: IpcMainInvokeEvent,
    options: { jobMatchId: string; type: "resume" | "coverLetter" | "both" }
  ): Promise<{ success: boolean; requestId?: string; message?: string }> => {
    try {
      // First get the job match to get job details
      const matchRes = await fetch(`${API_URL}/job-matches/${options.jobMatchId}`, fetchOptions())
      if (!matchRes.ok) {
        return { success: false, message: `Failed to fetch job match: ${matchRes.status}` }
      }
      const matchData = await matchRes.json()
      const match = matchData.data || matchData

      // Start generation
      const res = await fetch(`${API_URL}/generator/start`, fetchOptions({
        method: "POST",
        body: JSON.stringify({
          generateType: options.type,
          job: {
            role: match.listing?.title || "Unknown Role",
            company: match.listing?.companyName || "Unknown Company",
            jobDescriptionUrl: match.listing?.url,
            jobDescriptionText: match.listing?.description,
            location: match.listing?.location,
          },
          jobMatchId: options.jobMatchId,
          date: new Date().toLocaleDateString(),
        }),
      }))

      if (!res.ok) {
        const errorText = await res.text()
        return { success: false, message: `Generation failed: ${errorText.slice(0, 100)}` }
      }

      const data = await res.json()
      return { success: true, requestId: data.requestId || data.data?.requestId || data.id }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { success: false, message }
    }
  }
)

// Run full document generation with sequential step execution (matches frontend pattern)
// This sends progress updates via IPC as steps complete
ipcMain.handle(
  "run-generation",
  async (
    _event: IpcMainInvokeEvent,
    options: { jobMatchId: string; type: "resume" | "coverLetter" | "both" }
  ): Promise<{
    success: boolean
    data?: GenerationProgress
    message?: string
  }> => {
    try {
      // First get the job match to get job details
      const matchRes = await fetch(`${API_URL}/job-matches/${options.jobMatchId}`, fetchOptions())
      if (!matchRes.ok) {
        return { success: false, message: `Failed to fetch job match: ${matchRes.status}` }
      }
      const matchData = await matchRes.json()
      const match = matchData.data || matchData

      // Start generation
      logger.info("Starting document generation...")
      const startRes = await fetch(`${API_URL}/generator/start`, fetchOptions({
        method: "POST",
        body: JSON.stringify({
          generateType: options.type,
          job: {
            role: match.listing?.title || "Unknown Role",
            company: match.listing?.companyName || "Unknown Company",
            jobDescriptionUrl: match.listing?.url,
            jobDescriptionText: match.listing?.description,
            location: match.listing?.location,
          },
          jobMatchId: options.jobMatchId,
          date: new Date().toLocaleDateString(),
        }),
      }))

      if (!startRes.ok) {
        const errorText = await startRes.text()
        return { success: false, message: `Generation failed to start: ${errorText.slice(0, 100)}` }
      }

      const startData = await startRes.json()
      const requestId = startData.requestId || startData.data?.requestId
      let nextStep = startData.data?.nextStep || startData.nextStep
      let currentSteps: GenerationStep[] = startData.data?.steps || startData.steps || []
      let resumeUrl = startData.data?.resumeUrl || startData.resumeUrl
      let coverLetterUrl = startData.data?.coverLetterUrl || startData.coverLetterUrl

      logger.info(`Generation started: ${requestId}, next step: ${nextStep}`)

      // Send initial progress to renderer
      if (mainWindow) {
        mainWindow.webContents.send("generation-progress", {
          requestId,
          status: "processing",
          steps: currentSteps,
          currentStep: nextStep,
          resumeUrl,
          coverLetterUrl,
        })
      }

      // Execute steps sequentially until complete (with safety limit)
      let stepCount = 0
      while (nextStep !== null && nextStep !== undefined && nextStep !== "" && stepCount < MAX_GENERATION_STEPS) {
        stepCount++
        // Update step status to in_progress
        currentSteps = currentSteps.map((s) =>
          s.id === nextStep ? { ...s, status: "in_progress" as const } : s
        )

        // Send progress update
        if (mainWindow) {
          mainWindow.webContents.send("generation-progress", {
            requestId,
            status: "processing",
            steps: currentSteps,
            currentStep: nextStep,
            resumeUrl,
            coverLetterUrl,
          })
        }

        logger.info(`Executing step: ${nextStep}`)
        const stepRes = await fetch(`${API_URL}/generator/step/${requestId}`, fetchOptions({
          method: "POST",
          body: JSON.stringify({}),
        }))

        if (!stepRes.ok) {
          const errorText = await stepRes.text()
          return {
            success: false,
            message: `Step execution failed: ${errorText.slice(0, 100)}`,
            data: {
              requestId,
              status: "failed",
              steps: currentSteps,
              error: errorText.slice(0, 100),
            },
          }
        }

        const stepData = await stepRes.json()
        const stepResult = stepData.data || stepData

        // Check for failure
        if (stepResult.status === "failed") {
          return {
            success: false,
            message: stepResult.error || "Generation step failed",
            data: {
              requestId,
              status: "failed",
              steps: stepResult.steps || currentSteps,
              error: stepResult.error,
            },
          }
        }

        // Update state from step result
        if (stepResult.steps) {
          currentSteps = stepResult.steps
        }
        if (stepResult.resumeUrl) {
          resumeUrl = stepResult.resumeUrl
        }
        if (stepResult.coverLetterUrl) {
          coverLetterUrl = stepResult.coverLetterUrl
        }
        nextStep = stepResult.nextStep

        logger.info(`Step completed, next: ${nextStep || "done"}`)

        // Send progress update
        if (mainWindow) {
          mainWindow.webContents.send("generation-progress", {
            requestId,
            status: nextStep ? "processing" : "completed",
            steps: currentSteps,
            currentStep: nextStep,
            resumeUrl,
            coverLetterUrl,
          })
        }
      }

      // Safety check: if we hit max steps but nextStep is still set, something went wrong
      if (nextStep && stepCount >= MAX_GENERATION_STEPS) {
        logger.error(`Generation exceeded max steps (${MAX_GENERATION_STEPS})`)
        return {
          success: false,
          message: `Generation exceeded maximum steps (${MAX_GENERATION_STEPS}). This may indicate a backend issue.`,
          data: {
            requestId,
            status: "failed",
            steps: currentSteps,
            error: "Exceeded maximum generation steps",
          },
        }
      }

      logger.info("Generation completed successfully")
      return {
        success: true,
        data: {
          requestId,
          status: "completed",
          steps: currentSteps,
          resumeUrl,
          coverLetterUrl,
        },
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error("Generation error:", message)
      return { success: false, message }
    }
  }
)

// Enhanced form fill with EEO, job match context, and results tracking
ipcMain.handle(
  "fill-form-enhanced",
  async (
    _event: IpcMainInvokeEvent,
    options: { provider: CliProvider; jobMatchId?: string; documentId?: string }
  ): Promise<{ success: boolean; data?: FormFillSummary; message?: string }> => {
    const startTime = Date.now()

    try {
      if (!browserView) throw new Error("BrowserView not initialized")

      // 1. Get profile with EEO from backend
      logger.info("Fetching profile from backend...")
      const profileRes = await fetch(`${API_URL}/config/personal-info`, fetchOptions())
      if (!profileRes.ok) {
        throw new Error(`Failed to fetch profile: ${profileRes.status}`)
      }
      const profileData = await profileRes.json()
      const profile: PersonalInfo = profileData.data || profileData

      // Validate required profile fields
      if (!profile.name || !profile.email) {
        throw new Error("Profile missing required fields (name, email). Please configure your profile first.")
      }

      // 2. Get content items (work history)
      const contentRes = await fetch(`${API_URL}/content-items?limit=100`, fetchOptions())
      let workHistory: ContentItem[] = []
      if (contentRes.ok) {
        const contentData = await contentRes.json()
        workHistory = contentData.data || []
      }

      // 3. Get job match data if provided
      let jobMatchData: Record<string, unknown> | null = null
      if (options.jobMatchId) {
        const matchRes = await fetch(`${API_URL}/job-matches/${options.jobMatchId}`, fetchOptions())
        if (matchRes.ok) {
          const matchJson = await matchRes.json()
          jobMatchData = matchJson.data || matchJson
        }
      }

      // 4. Extract form fields from page
      logger.info("Extracting form fields...")
      const fields: FormField[] = await browserView.webContents.executeJavaScript(EXTRACT_FORM_SCRIPT)
      logger.info(`Found ${fields.length} form fields`)

      if (fields.length === 0) {
        return { success: false, message: "No form fields found on page" }
      }

      // 5. Build enhanced prompt
      const prompt = buildEnhancedPrompt(fields, profile, workHistory, jobMatchData)
      logger.info(`Calling ${options.provider} CLI for enhanced field mapping...`)

      // 6. Call CLI for fill instructions with skip tracking
      const instructions = await runEnhancedCli(options.provider, prompt)
      logger.info(`Got ${instructions.length} fill instructions`)

      // 7. Fill fields and track results
      let filledCount = 0
      const skippedFields: Array<{ label: string; reason: string }> = []

      for (const instruction of instructions) {
        if (instruction.status === "skipped") {
          skippedFields.push({
            label: instruction.label || instruction.selector || "Unknown field",
            reason: instruction.reason || "No data available",
          })
          continue
        }

        if (!instruction.value) continue

        try {
          const safeSelector = JSON.stringify(instruction.selector)
          const safeValue = JSON.stringify(instruction.value)
          const filled = await browserView.webContents.executeJavaScript(`
            (() => {
              const el = document.querySelector(${safeSelector});
              if (!el) return false;
              if (el.tagName.toLowerCase() === 'select') {
                el.value = ${safeValue};
                el.dispatchEvent(new Event('change', { bubbles: true }));
              } else {
                el.value = ${safeValue};
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
              }
              return true;
            })()
          `)
          if (filled) filledCount++
        } catch (err) {
          logger.warn(`Failed to fill ${instruction.selector}:`, err)
        }
      }

      const duration = Date.now() - startTime
      const summary: FormFillSummary = {
        totalFields: fields.length,
        filledCount,
        skippedCount: skippedFields.length,
        skippedFields,
        duration,
      }

      return { success: true, data: summary }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error("Enhanced fill form error:", message)
      return { success: false, message }
    }
  }
)

// CLI command configurations
const CLI_COMMANDS: Record<CliProvider, [string, string[]]> = {
  claude: ["claude", ["--print", "--output-format", "json", "-p", "-"]],
  codex: ["codex", ["exec", "--json", "--skip-git-repo-check"]],
  gemini: ["gemini", ["-o", "json", "--yolo"]],
}

function runEnhancedCli(provider: CliProvider, prompt: string): Promise<EnhancedFillInstruction[]> {
  const [cmd, args] = CLI_COMMANDS[provider]

  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args)
    let stdout = ""
    let stderr = ""

    const timeout = setTimeout(() => {
      child.kill("SIGTERM")
      reject(new Error(`${provider} CLI timed out after ${CLI_TIMEOUT_MS / 1000}s`))
    }, CLI_TIMEOUT_MS)

    child.stdin.write(prompt)
    child.stdin.end()

    child.stdout.on("data", (d) => (stdout += d))
    child.stderr.on("data", (d) => (stderr += d))

    child.on("error", (err) => {
      clearTimeout(timeout)
      // Provide helpful error if CLI tool is not installed
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        reject(new Error(`${provider} CLI not found. Please install it first and ensure it's in your PATH.`))
      } else {
        reject(new Error(`Failed to spawn ${provider} CLI: ${err.message}`))
      }
    })

    child.on("close", (code) => {
      clearTimeout(timeout)
      if (code === 0) {
        try {
          // Find first [ and last ] for more robust JSON extraction
          const startIdx = stdout.indexOf("[")
          const endIdx = stdout.lastIndexOf("]")
          if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
            const jsonStr = stdout.substring(startIdx, endIdx + 1)
            const parsed = JSON.parse(jsonStr)
            if (!Array.isArray(parsed)) {
              reject(new Error(`${provider} CLI did not return an array`))
              return
            }
            resolve(
              parsed.map((item: Record<string, unknown>) => ({
                selector: String(item.selector || ""),
                value: item.value != null ? String(item.value) : null,
                status: item.status === "skipped" ? "skipped" : "filled",
                reason: item.reason ? String(item.reason) : undefined,
                label: item.label ? String(item.label) : undefined,
              }))
            )
          } else {
            reject(new Error(`${provider} CLI returned no JSON array: ${stdout.slice(0, 200)}`))
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          reject(new Error(`${provider} CLI returned invalid JSON: ${msg}\n${stdout.slice(0, 200)}`))
        }
      } else {
        reject(new Error(`${provider} CLI failed (exit ${code}): ${stderr || stdout}`))
      }
    })
  })
}

function runCliForExtraction(provider: CliProvider, prompt: string): Promise<JobExtraction> {
  const [cmd, args] = CLI_COMMANDS[provider]

  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args)
    let stdout = ""
    let stderr = ""

    const timeout = setTimeout(() => {
      child.kill("SIGTERM")
      reject(new Error(`${provider} CLI timed out after ${CLI_TIMEOUT_MS / 1000}s`))
    }, CLI_TIMEOUT_MS)

    child.stdin.write(prompt)
    child.stdin.end()

    child.stdout.on("data", (d) => (stdout += d))
    child.stderr.on("data", (d) => (stderr += d))

    child.on("error", (err) => {
      clearTimeout(timeout)
      // Provide helpful error if CLI tool is not installed
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        reject(new Error(`${provider} CLI not found. Please install it first and ensure it's in your PATH.`))
      } else {
        reject(new Error(`Failed to spawn ${provider} CLI: ${err.message}`))
      }
    })

    child.on("close", (code) => {
      clearTimeout(timeout)
      logger.info(`[CLI] Exit code: ${code}, stdout length: ${stdout.length}`)
      if (code === 0) {
        try {
          // Claude CLI returns: {"type":"result","result":"...JSON or markdown with JSON..."}
          // We need to extract the actual job data from the result field
          const outerJson = JSON.parse(stdout)
          let jobData: Record<string, unknown>

          if (outerJson.result && typeof outerJson.result === "string") {
            // Result is a string - extract JSON from it (may be in markdown code block)
            const resultStr = outerJson.result
            // Try to find JSON in markdown code block first
            const codeBlockMatch = resultStr.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/)
            if (codeBlockMatch) {
              jobData = JSON.parse(codeBlockMatch[1])
            } else {
              // Try to find raw JSON object
              const jsonMatch = resultStr.match(/\{[\s\S]*\}/)
              if (jsonMatch) {
                jobData = JSON.parse(jsonMatch[0])
              } else {
                throw new Error("No JSON found in result")
              }
            }
          } else if (outerJson.title !== undefined) {
            // Direct job data (no wrapper)
            jobData = outerJson
          } else {
            throw new Error("Unexpected response format")
          }

          logger.info(`[CLI] Parsed job data:`, jobData)
          resolve({
            title: (jobData.title as string) ?? null,
            description: (jobData.description as string) ?? null,
            location: (jobData.location as string) ?? null,
            techStack: (jobData.techStack as string) ?? null,
            companyName: (jobData.companyName as string) ?? null,
          })
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          reject(new Error(`${provider} CLI returned invalid JSON: ${msg}\n${stdout.slice(0, 300)}`))
        }
      } else {
        reject(new Error(`${provider} CLI failed (exit ${code}): ${stderr || stdout}`))
      }
    })
  })
}

function runCli(provider: CliProvider, prompt: string): Promise<FillInstruction[]> {
  const [cmd, args] = CLI_COMMANDS[provider]

  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args)
    let stdout = ""
    let stderr = ""

    const timeout = setTimeout(() => {
      child.kill("SIGTERM")
      reject(new Error(`${provider} CLI timed out after ${CLI_TIMEOUT_MS / 1000}s`))
    }, CLI_TIMEOUT_MS)

    // Pass prompt via stdin to avoid shell injection
    child.stdin.write(prompt)
    child.stdin.end()

    child.stdout.on("data", (d) => (stdout += d))
    child.stderr.on("data", (d) => (stderr += d))

    child.on("error", (err) => {
      clearTimeout(timeout)
      // Provide helpful error if CLI tool is not installed
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        reject(new Error(`${provider} CLI not found. Please install it first and ensure it's in your PATH.`))
      } else {
        reject(new Error(`Failed to spawn ${provider} CLI: ${err.message}`))
      }
    })

    child.on("close", (code) => {
      clearTimeout(timeout)
      if (code === 0) {
        try {
          // Find first [ and last ] for more robust JSON extraction
          const startIdx = stdout.indexOf("[")
          const endIdx = stdout.lastIndexOf("]")
          if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
            const jsonStr = stdout.substring(startIdx, endIdx + 1)
            const parsed = JSON.parse(jsonStr)
            // Validate the response structure
            if (!Array.isArray(parsed)) {
              reject(new Error(`${provider} CLI did not return an array`))
              return
            }
            for (const item of parsed) {
              if (typeof item?.selector !== "string" || typeof item?.value !== "string") {
                reject(new Error(`${provider} CLI returned invalid FillInstruction format`))
                return
              }
            }
            resolve(parsed)
          } else {
            reject(
              new Error(
                `${provider} CLI returned no JSON array: ${stdout.slice(0, 200)}${stdout.length > 200 ? "..." : ""}`
              )
            )
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          reject(
            new Error(
              `${provider} CLI returned invalid JSON: ${msg}\n${stdout.slice(0, 200)}${stdout.length > 200 ? "..." : ""}`
            )
          )
        }
      } else {
        reject(new Error(`${provider} CLI failed (exit ${code}): ${stderr || stdout}`))
      }
    })
  })
}

// App lifecycle
app.whenReady().then(() => {
  createWindow()

  // Register global shortcuts for DevTools
  // Use 'detach' mode to open in separate window (works better on Linux)
  globalShortcut.register("CommandOrControl+Shift+I", () => {
    logger.info("Opening sidebar DevTools...")
    if (mainWindow?.webContents.isDevToolsOpened()) {
      mainWindow.webContents.closeDevTools()
    } else {
      mainWindow?.webContents.openDevTools({ mode: "detach" })
    }
  })
  globalShortcut.register("CommandOrControl+Shift+J", () => {
    logger.info("Opening page DevTools...")
    if (browserView?.webContents.isDevToolsOpened()) {
      browserView.webContents.closeDevTools()
    } else {
      browserView?.webContents.openDevTools({ mode: "detach" })
    }
  })

  // Create application menu with DevTools options
  const menu = Menu.buildFromTemplate([
    {
      label: "View",
      submenu: [
        {
          label: "Toggle Sidebar DevTools",
          accelerator: "CommandOrControl+Shift+I",
          click: () => {
            logger.info("Menu: Opening sidebar DevTools...")
            if (mainWindow?.webContents.isDevToolsOpened()) {
              mainWindow.webContents.closeDevTools()
            } else {
              mainWindow?.webContents.openDevTools({ mode: "detach" })
            }
          },
        },
        {
          label: "Toggle Page DevTools",
          accelerator: "CommandOrControl+Shift+J",
          click: () => {
            logger.info("Menu: Opening page DevTools...")
            if (browserView?.webContents.isDevToolsOpened()) {
              browserView.webContents.closeDevTools()
            } else {
              browserView?.webContents.openDevTools({ mode: "detach" })
            }
          },
        },
        { type: "separator" },
        { role: "reload" },
        { role: "forceReload" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
  ])
  Menu.setApplicationMenu(menu)
})

app.on("will-quit", () => {
  globalShortcut.unregisterAll()
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit()
  }
})

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})
