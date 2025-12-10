import { app, BrowserWindow, BrowserView, ipcMain, IpcMainInvokeEvent } from "electron"
import { chromium, Browser, Page } from "playwright-core"
import { spawn } from "child_process"
import * as path from "path"
import * as fs from "fs"
import * as os from "os"

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
import {
  normalizeUrl,
  resolveDocumentPath,
  buildPrompt,
  buildEnhancedPrompt,
  buildExtractionPrompt,
} from "./utils.js"

// Configuration from environment
const CDP_PORT = process.env.CDP_PORT || "9222"
// NOTE: The default API_URL uses HTTP and is intended for local development only.
// In production, always set JOB_FINDER_API_URL to a secure HTTPS endpoint.
const API_URL = process.env.JOB_FINDER_API_URL || "http://localhost:3000/api"
// Artifacts directory - must match backend's GENERATOR_ARTIFACTS_DIR
const ARTIFACTS_DIR = process.env.GENERATOR_ARTIFACTS_DIR || "/data/artifacts"

// Enforce HTTPS in production
if (process.env.NODE_ENV === "production" && API_URL.startsWith("http://")) {
  throw new Error(
    "SECURITY ERROR: API_URL must use HTTPS in production. " +
      "Set JOB_FINDER_API_URL to a secure endpoint (https://...)."
  )
}

// Layout constants
const TOOLBAR_HEIGHT = 60
const SIDEBAR_WIDTH = 300

// CLI timeout constant
const CLI_TIMEOUT_MS = 60000

// Maximum steps for generation workflow (prevent infinite loops)
const MAX_GENERATION_STEPS = 20

// Enable remote debugging for Playwright CDP connection
app.commandLine.appendSwitch("remote-debugging-port", CDP_PORT)

// Global state
let mainWindow: BrowserWindow | null = null
let browserView: BrowserView | null = null
let playwrightBrowser: Browser | null = null
let sidebarOpen = false
let cdpConnected = false

// Update BrowserView bounds based on sidebar state
function updateBrowserViewBounds(): void {
  if (!browserView || !mainWindow) return
  const bounds = mainWindow.getBounds()
  const offsetX = sidebarOpen ? SIDEBAR_WIDTH : 0
  browserView.setBounds({
    x: offsetX,
    y: TOOLBAR_HEIGHT,
    width: bounds.width - offsetX,
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
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(import.meta.dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

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

  // Load the renderer UI (toolbar)
  await mainWindow.loadFile(path.join(import.meta.dirname, "renderer", "index.html"))

  // Connect to Playwright via CDP
  try {
    playwrightBrowser = await chromium.connectOverCDP(`http://localhost:${CDP_PORT}`)
    cdpConnected = true
    console.log("Connected to Playwright CDP")
  } catch (err) {
    cdpConnected = false
    console.error("Failed to connect to Playwright CDP:", err)
    // Notify renderer of CDP connection failure (file uploads will be unavailable)
    mainWindow.webContents.send("cdp-status", {
      connected: false,
      message: "Playwright CDP connection failed. File uploads will be unavailable.",
    })
  }

  mainWindow.on("closed", () => {
    mainWindow = null
    browserView = null
  })

  mainWindow.on("resize", () => {
    updateBrowserViewBounds()
  })
}

// Navigate to URL
ipcMain.handle("navigate", async (_event: IpcMainInvokeEvent, url: string): Promise<void> => {
  if (!browserView) throw new Error("BrowserView not initialized")
  await browserView.webContents.loadURL(url)
})

// Get current URL
ipcMain.handle("get-url", async (): Promise<string> => {
  if (!browserView) throw new Error("BrowserView not initialized")
  return browserView.webContents.getURL()
})

// Fill form with AI
ipcMain.handle(
  "fill-form",
  async (_event: IpcMainInvokeEvent, provider: CliProvider): Promise<{ success: boolean; message: string }> => {
    try {
      if (!browserView) throw new Error("BrowserView not initialized")

      // 1. Get profile and work history from job-finder backend
      console.log("Fetching profile from backend...")
      const [profileRes, contentRes] = await Promise.all([
        fetch(`${API_URL}/config/personal-info`),
        fetch(`${API_URL}/content-items?limit=100`)
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
        console.log(`Fetched ${workHistory.length} work history items`)
      }

      // 2. Extract form fields from page
      console.log("Extracting form fields...")
      const fields: FormField[] = await browserView.webContents.executeJavaScript(EXTRACT_FORM_SCRIPT)
      console.log(`Found ${fields.length} form fields`)

      if (fields.length === 0) {
        return { success: false, message: "No form fields found on page" }
      }

      // 3. Build prompt and call CLI
      console.log(`Calling ${provider} CLI for field mapping...`)
      const prompt = buildPrompt(fields, profile, workHistory)
      const instructions = await runCli(provider, prompt)
      console.log(`Got ${instructions.length} fill instructions`)

      // 4. Fill fields using executeJavaScript (reliable with BrowserView)
      // Note: Playwright CDP page matching is unreliable with BrowserView,
      // so we use executeJavaScript directly on the webContents
      console.log("Filling form fields...")
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
          console.warn(`Failed to fill ${instruction.selector}:`, err)
        }
      }

      return {
        success: true,
        message: `Filled ${filledCount}/${instructions.length} fields`,
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error("Fill form error:", message)
      return { success: false, message }
    }
  }
)

// Upload resume/document to form
ipcMain.handle(
  "upload-resume",
  async (
    _event: IpcMainInvokeEvent,
    options?: { documentId?: string; type?: "resume" | "coverLetter" }
  ): Promise<{ success: boolean; message: string; filePath?: string }> => {
    let resolvedPath: string | null = null

    try {
      if (!browserView) throw new Error("BrowserView not initialized")

      // Find file input
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
        // Fetch document details from backend
        const docRes = await fetch(`${API_URL}/generator/requests/${options.documentId}`)
        if (!docRes.ok) {
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

      // File uploads require Playwright
      if (!playwrightBrowser) {
        return {
          success: false,
          message: `Playwright connection required for file upload. Manual upload: ${resolvedPath}`,
          filePath: resolvedPath,
        }
      }

      // Get the current URL from BrowserView to find the matching page
      const currentUrl = browserView.webContents.getURL()
      const currentNormalized = normalizeUrl(currentUrl)
      let targetPage: Page | null = null

      for (const context of playwrightBrowser.contexts()) {
        for (const page of context.pages()) {
          if (normalizeUrl(page.url()) === currentNormalized) {
            targetPage = page
            break
          }
        }
        if (targetPage) break
      }

      if (!targetPage) {
        return {
          success: false,
          message: `Could not find page handle for upload. Manual upload: ${resolvedPath}`,
          filePath: resolvedPath,
        }
      }

      await targetPage.setInputFiles(fileInputSelector, resolvedPath)
      return { success: true, message: "Document uploaded", filePath: resolvedPath }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return {
        success: false,
        message: resolvedPath ? `Upload failed: ${message}. Manual upload: ${resolvedPath}` : message,
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

      console.log(`Extracting job details from: ${url}`)

      // 2. Extract page content (text only, limited to 10k chars)
      const pageContent: string = await browserView.webContents.executeJavaScript(`
        document.body.innerText.slice(0, 10000)
      `)

      if (!pageContent || pageContent.trim().length < 100) {
        return { success: false, message: "Page content too short - is this a job listing?" }
      }

      // 3. Use AI CLI to extract job details
      console.log(`Calling ${provider} CLI for job extraction...`)
      const extractPrompt = buildExtractionPrompt(pageContent, url)
      const extracted = await runCliForExtraction(provider, extractPrompt)
      console.log("Extracted job details:", extracted)

      // 4. Submit to backend API with bypassFilter
      console.log("Submitting job to queue...")
      const res = await fetch(`${API_URL}/queue/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
      })

      if (!res.ok) {
        const errorText = await res.text()
        return { success: false, message: `API error (${res.status}): ${errorText.slice(0, 100)}` }
      }

      const result = await res.json()
      const queueId = result.data?.id || result.id || "unknown"
      return { success: true, message: `Job submitted (queue ID: ${queueId})` }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error("Submit job error:", message)
      return { success: false, message }
    }
  }
)

// Sidebar state handlers
ipcMain.handle("set-sidebar-state", async (_event: IpcMainInvokeEvent, open: boolean): Promise<void> => {
  sidebarOpen = open
  updateBrowserViewBounds()
})

ipcMain.handle("get-sidebar-state", async (): Promise<{ open: boolean }> => {
  return { open: sidebarOpen }
})

// CDP connection status
ipcMain.handle("get-cdp-status", async (): Promise<{ connected: boolean; message?: string }> => {
  return {
    connected: cdpConnected,
    message: cdpConnected ? undefined : "Playwright CDP not connected. File uploads unavailable.",
  }
})

// Get job matches from backend
ipcMain.handle(
  "get-job-matches",
  async (
    _event: IpcMainInvokeEvent,
    options?: { limit?: number; status?: string }
  ): Promise<{ success: boolean; data?: unknown[]; message?: string }> => {
    try {
      const limit = options?.limit || 50
      const status = options?.status || "active"
      const res = await fetch(`${API_URL}/job-matches/?limit=${limit}&status=${status}&sortBy=updated&sortOrder=desc`)
      if (!res.ok) {
        return { success: false, message: `Failed to fetch job matches: ${res.status}` }
      }
      const data = await res.json()
      return { success: true, data: data.data || data }
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
      const res = await fetch(`${API_URL}/job-matches/${id}`)
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
      const res = await fetch(`${API_URL}/generator/job-matches/${jobMatchId}/documents`)
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
      const res = await fetch(`${API_URL}/job-matches/${options.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: options.status }),
      })
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
      const res = await fetch(`${API_URL}/job-matches/?limit=100&sortBy=updated&sortOrder=desc`)
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
      const matchRes = await fetch(`${API_URL}/job-matches/${options.jobMatchId}`)
      if (!matchRes.ok) {
        return { success: false, message: `Failed to fetch job match: ${matchRes.status}` }
      }
      const matchData = await matchRes.json()
      const match = matchData.data || matchData

      // Start generation
      const res = await fetch(`${API_URL}/generator/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
      })

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
      const matchRes = await fetch(`${API_URL}/job-matches/${options.jobMatchId}`)
      if (!matchRes.ok) {
        return { success: false, message: `Failed to fetch job match: ${matchRes.status}` }
      }
      const matchData = await matchRes.json()
      const match = matchData.data || matchData

      // Start generation
      console.log("Starting document generation...")
      const startRes = await fetch(`${API_URL}/generator/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
      })

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

      console.log(`Generation started: ${requestId}, next step: ${nextStep}`)

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
      while (nextStep && stepCount < MAX_GENERATION_STEPS) {
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

        console.log(`Executing step: ${nextStep}`)
        const stepRes = await fetch(`${API_URL}/generator/step/${requestId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        })

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

        console.log(`Step completed, next: ${nextStep || "done"}`)

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
        console.error(`Generation exceeded max steps (${MAX_GENERATION_STEPS})`)
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

      console.log("Generation completed successfully")
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
      console.error("Generation error:", message)
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
      console.log("Fetching profile from backend...")
      const profileRes = await fetch(`${API_URL}/config/personal-info`)
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
      const contentRes = await fetch(`${API_URL}/content-items?limit=100`)
      let workHistory: ContentItem[] = []
      if (contentRes.ok) {
        const contentData = await contentRes.json()
        workHistory = contentData.data || []
      }

      // 3. Get job match data if provided
      let jobMatchData: Record<string, unknown> | null = null
      if (options.jobMatchId) {
        const matchRes = await fetch(`${API_URL}/job-matches/${options.jobMatchId}`)
        if (matchRes.ok) {
          const matchJson = await matchRes.json()
          jobMatchData = matchJson.data || matchJson
        }
      }

      // 4. Extract form fields from page
      console.log("Extracting form fields...")
      const fields: FormField[] = await browserView.webContents.executeJavaScript(EXTRACT_FORM_SCRIPT)
      console.log(`Found ${fields.length} form fields`)

      if (fields.length === 0) {
        return { success: false, message: "No form fields found on page" }
      }

      // 5. Build enhanced prompt
      const prompt = buildEnhancedPrompt(fields, profile, workHistory, jobMatchData)
      console.log(`Calling ${options.provider} CLI for enhanced field mapping...`)

      // 6. Call CLI for fill instructions with skip tracking
      const instructions = await runEnhancedCli(options.provider, prompt)
      console.log(`Got ${instructions.length} fill instructions`)

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
          console.warn(`Failed to fill ${instruction.selector}:`, err)
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
      console.error("Enhanced fill form error:", message)
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
      if (code === 0) {
        try {
          // Find first { and last } for more robust JSON extraction
          const startIdx = stdout.indexOf("{")
          const endIdx = stdout.lastIndexOf("}")
          if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
            const jsonStr = stdout.substring(startIdx, endIdx + 1)
            const parsed = JSON.parse(jsonStr)
            resolve({
              title: parsed.title ?? null,
              description: parsed.description ?? null,
              location: parsed.location ?? null,
              techStack: parsed.techStack ?? null,
              companyName: parsed.companyName ?? null,
            })
          } else {
            reject(new Error(`${provider} CLI returned no JSON object: ${stdout.slice(0, 200)}`))
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
app.whenReady().then(createWindow)

app.on("window-all-closed", () => {
  if (playwrightBrowser) {
    playwrightBrowser.close().catch(console.error)
  }
  if (process.platform !== "darwin") {
    app.quit()
  }
})

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})
