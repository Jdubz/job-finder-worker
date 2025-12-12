import { app, BrowserWindow, BrowserView, ipcMain, IpcMainInvokeEvent, globalShortcut, Menu, shell } from "electron"
import type { WebContents, RenderProcessGoneDetails } from "electron"
import { spawn } from "child_process"
import * as path from "path"
import * as fs from "fs"
import * as os from "os"

// Load .env file if it exists (simple loader, no external dependency)
const envPath = path.join(import.meta.dirname, "..", ".env")
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8")
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith("#")) {
      const [key, ...valueParts] = trimmed.split("=")
      const value = valueParts.join("=").trim()
      if (key && value && !process.env[key]) {
        process.env[key] = value
      }
    }
  }
}

import { logger } from "./logger.js"

// Log loaded environment for debugging
logger.info(`[ENV] JOB_FINDER_API_URL = ${process.env.JOB_FINDER_API_URL || "(not set, using default)"}`)

// Disable GPU acceleration to fix DevTools issues on Linux
app.disableHardwareAcceleration()
app.commandLine.appendSwitch("disable-gpu")
app.commandLine.appendSwitch("disable-software-rasterizer")

logger.info("Main process starting...")

// Listen for renderer console logs and forward to main process logger
ipcMain.on("renderer-log", (_event: unknown, level: string, args: unknown[]) => {
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
  JobExtraction,
  GenerationStep,
  GenerationProgress,
} from "./types.js"
import type { JobMatchWithListing } from "@shared/types"
import {
  resolveDocumentPath,
  buildExtractionPrompt,
  getUserFriendlyErrorMessage,
  parseCliObjectOutput,
  getConfig,
} from "./utils.js"

// Tool executor and server
import { startToolServer, stopToolServer } from "./tool-server.js"
import { setBrowserView, setCurrentJobMatchId, clearJobContext } from "./tool-executor.js"
// Typed API client
import {
  fetchApplicatorProfile,
  fetchJobMatches,
  fetchJobMatch,
  findJobMatchByUrl,
  updateJobMatchStatus,
  fetchDocuments,
  fetchGeneratorRequest,
  startGeneration,
  executeGenerationStep,
  submitJobToQueue,
  getApiUrl,
} from "./api-client.js"

// Artifacts directory - must match backend's GENERATOR_ARTIFACTS_DIR
const ARTIFACTS_DIR = process.env.GENERATOR_ARTIFACTS_DIR || "/data/artifacts"

// Layout constants
const TOOLBAR_HEIGHT = 60
const SIDEBAR_WIDTH = 300

// CLI timeout and warning thresholds
// 5 minutes for complex form fills - increased from 2 minutes (120s) to handle large forms
// Warning intervals help identify if operations are taking unusually long
const CLI_TIMEOUT_MS = 300000 // 5 minutes
const CLI_WARNING_INTERVALS = [30000, 60000, 90000] // Log warnings at 30s, 60s, 90s

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

  // Set BrowserView reference for agent tools
  setBrowserView(browserView)

  // Position BrowserView below toolbar, accounting for sidebar state
  updateBrowserViewBounds()
  browserView.setAutoResize({ width: true, height: true })

  // Intercept new window/tab requests and navigate in the same BrowserView
  // This prevents job application pages from opening in separate windows
  // which would break the form fill flow
  browserView.webContents.setWindowOpenHandler(({ url }) => {
    logger.info(`Intercepted new window request: ${url}`)
    // Navigate in the same BrowserView instead of opening a new window
    browserView?.webContents.loadURL(url)
    return { action: "deny" }
  })

  // Notify renderer when URL changes
  browserView.webContents.on("did-navigate", (_event, url) => {
    logger.info(`[BrowserView] Navigated to: ${url}`)
    mainWindow?.webContents.send("browser-url-changed", { url })
  })

  // Also handle in-page navigation (SPA apps)
  browserView.webContents.on("did-navigate-in-page", (_event, url) => {
    logger.info(`[BrowserView] In-page navigation to: ${url}`)
    mainWindow?.webContents.send("browser-url-changed", { url })
  })

  // Capture renderer console messages and errors BEFORE loading HTML
mainWindow.webContents.on("console-message", (_event: unknown, level: number, message: string, line: number, sourceId: string) => {
    const levelName = ["verbose", "info", "warning", "error"][level] || "unknown"
    logger.info(`[RENDERER:${levelName}] ${message} (${sourceId}:${line})`)
  })

mainWindow.webContents.on("did-fail-load", (_event: unknown, errorCode: number, errorDescription: string) => {
    logger.error(`[RENDERER] Failed to load: ${errorCode} - ${errorDescription}`)
  })

mainWindow.webContents.on("preload-error", (_event: unknown, preloadPath: string, error: Error) => {
    logger.error(`[PRELOAD ERROR] ${preloadPath}: ${error}`)
  })

mainWindow.webContents.on("render-process-gone", (_event: unknown, details: RenderProcessGoneDetails) => {
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
  // Note: DevTools may not open automatically with electronmon (make watch)
  // Use Cmd+Shift+I or View menu to toggle manually
  if (process.env.NODE_ENV !== "production") {
    mainWindow.webContents.openDevTools({ mode: "detach" })
  }

  mainWindow.on("closed", () => {
    mainWindow = null
    browserView = null
    setBrowserView(null)
  })

  mainWindow.on("resize", () => {
    updateBrowserViewBounds()
  })

  // DevTools shortcuts are handled via globalShortcut and application menu
  // See app.whenReady() for globalShortcut registration
}

// Navigate to URL
ipcMain.handle("navigate", async (_event: IpcMainInvokeEvent, url: string): Promise<{ success: boolean; message?: string; aborted?: boolean }> => {
  try {
    if (!browserView) {
      return { success: false, message: "Browser not initialized. Please restart the application." }
    }
    // Basic URL validation
    try {
      new URL(url)
    } catch {
      return { success: false, message: "Invalid URL format" }
    }
    await browserView.webContents.loadURL(url)
    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error("Navigation failed:", { url, error: message })
    // Map common errors to user-friendly messages
    if (message.includes("ERR_NAME_NOT_RESOLVED")) {
      return { success: false, message: "Could not find the website. Check the URL or your internet connection." }
    }
    if (message.includes("ERR_CONNECTION_REFUSED")) {
      return { success: false, message: "Connection refused. The website may be down." }
    }
    if (message.includes("ERR_INTERNET_DISCONNECTED") || message.includes("ERR_NETWORK_CHANGED")) {
      return { success: false, message: "No internet connection. Please check your network." }
    }
    if (message.includes("ERR_CERT")) {
      return { success: false, message: "SSL certificate error. The website may not be secure." }
    }
    if (message.includes("ERR_ABORTED")) {
      // Navigation was aborted (e.g., user navigated again quickly, or page redirected)
      // This is often not a real error, so we return success but indicate it was aborted
      return { success: true, aborted: true }
    }
    return { success: false, message: `Navigation failed: ${message}` }
  }
})

// Get current URL
ipcMain.handle("get-url", async (): Promise<string> => {
  if (!browserView) return ""
  return browserView.webContents.getURL()
})


// Helper function to set files on a file input using Electron's debugger API
async function setFileInputFiles(webContents: WebContents, selector: string, filePaths: string[]): Promise<void> {
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

        // Fetch document details from backend using typed API client
        const doc = await fetchGeneratorRequest(options.documentId)

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

// Get job matches from backend using typed API client
ipcMain.handle(
  "get-job-matches",
  async (
    _event: IpcMainInvokeEvent,
    options?: { limit?: number; status?: string }
  ): Promise<{ success: boolean; data?: JobMatchWithListing[]; message?: string }> => {
    try {
      const matches = await fetchJobMatches({
        limit: options?.limit,
        status: options?.status as "active" | "ignored" | "applied" | "all" | undefined,
      })
      return { success: true, data: matches }
    } catch (err) {
      const message = getUserFriendlyErrorMessage(err instanceof Error ? err : new Error(String(err)), logger)
      return { success: false, message }
    }
  }
)

// Get single job match with full details using typed API client
ipcMain.handle(
  "get-job-match",
  async (_event: IpcMainInvokeEvent, id: string): Promise<{ success: boolean; data?: JobMatchWithListing; message?: string }> => {
    try {
      const match = await fetchJobMatch(id)
      return { success: true, data: match }
    } catch (err) {
      const message = getUserFriendlyErrorMessage(err instanceof Error ? err : new Error(String(err)), logger)
      return { success: false, message }
    }
  }
)

// Get documents for a job match using typed API client
ipcMain.handle(
  "get-documents",
  async (_event: IpcMainInvokeEvent, jobMatchId: string): Promise<{ success: boolean; data?: unknown[]; message?: string }> => {
    try {
      const documents = await fetchDocuments(jobMatchId)
      return { success: true, data: documents }
    } catch (err) {
      const message = getUserFriendlyErrorMessage(err instanceof Error ? err : new Error(String(err)), logger)
      return { success: false, message }
    }
  }
)

// Open document URL in external browser
// Document URLs from the API are relative paths like "/api/generator/artifacts/..."
// We need to resolve them to full URLs using the API base URL
ipcMain.handle(
  "open-document",
  async (_event: IpcMainInvokeEvent, documentPath: string): Promise<{ success: boolean; message?: string }> => {
    try {
      // getApiUrl() returns like "http://localhost:3000/api"
      // documentPath is like "/api/generator/artifacts/2025-12-11/file.pdf"
      // We need to construct the full URL by using the origin from API_URL
      const apiUrlObj = new URL(getApiUrl())
      const fullUrl = `${apiUrlObj.origin}${documentPath}`

      logger.info(`Opening document: ${fullUrl}`)
      await shell.openExternal(fullUrl)
      return { success: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error(`Failed to open document: ${message}`)
      return { success: false, message }
    }
  }
)

// Update job match status (mark as applied, ignored, etc.) using typed API client
ipcMain.handle(
  "update-job-match-status",
  async (
    _event: IpcMainInvokeEvent,
    options: { id: string; status: "active" | "ignored" | "applied" }
  ): Promise<{ success: boolean; message?: string }> => {
    try {
      await updateJobMatchStatus(options.id, options.status)
      return { success: true }
    } catch (err) {
      const message = getUserFriendlyErrorMessage(err instanceof Error ? err : new Error(String(err)), logger)
      return { success: false, message }
    }
  }
)

// Find job match by URL (for auto-detection) using typed API client
ipcMain.handle(
  "find-job-match-by-url",
  async (
    _event: IpcMainInvokeEvent,
    url: string
  ): Promise<{ success: boolean; data?: JobMatchWithListing | null; message?: string }> => {
    try {
      const match = await findJobMatchByUrl(url)
      return { success: true, data: match }
    } catch (err) {
      const message = getUserFriendlyErrorMessage(err instanceof Error ? err : new Error(String(err)), logger)
      return { success: false, message }
    }
  }
)

// Start document generation (simple - returns requestId only) using typed API client
ipcMain.handle(
  "start-generation",
  async (
    _event: IpcMainInvokeEvent,
    options: { jobMatchId: string; type: "resume" | "coverLetter" | "both" }
  ): Promise<{ success: boolean; requestId?: string; message?: string }> => {
    try {
      const result = await startGeneration(options)
      return { success: true, requestId: result.requestId }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { success: false, message }
    }
  }
)

// Run full document generation with sequential step execution (matches frontend pattern)
// This sends progress updates via IPC as steps complete, using typed API client
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
      // Start generation using typed API client
      logger.info("Starting document generation...")
      const startResult = await startGeneration(options)
      const requestId = startResult.requestId
      let nextStep = startResult.nextStep
      let currentSteps: GenerationStep[] = startResult.steps || []
      let resumeUrl = startResult.resumeUrl
      let coverLetterUrl = startResult.coverLetterUrl

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
        const stepResult = await executeGenerationStep(requestId)

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

/**
 * Run CLI for one-shot commands (job extraction)
 * Uses Claude CLI with JSON output format
 */
function runCliCommon<T>(
  _provider: CliProvider,
  prompt: string,
  parse: (stdout: string) => T,
  context: string
): Promise<T> {
  // Use Claude CLI for job extraction
  const cmd = "claude"
  const args = ["--print", "--output-format", "json", "--dangerously-skip-permissions", "-p", "-"]

  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args)
    let stdout = ""
    let stderr = ""

    const warningTimers = CLI_WARNING_INTERVALS.map((ms) =>
      setTimeout(() => {
        logger.warn(`[CLI] Claude ${context} still running after ${ms / 1000}s...`)
      }, ms)
    )

    const timeout = setTimeout(() => {
      child.kill("SIGTERM")
      reject(new Error(`Claude CLI timed out after ${CLI_TIMEOUT_MS / 1000}s (${context})`))
    }, CLI_TIMEOUT_MS)

    const clearAllTimers = () => {
      warningTimers.forEach(clearTimeout)
      clearTimeout(timeout)
    }

    child.stdin.write(prompt)
    child.stdin.end()

    child.stdout.on("data", (d) => (stdout += d))
    child.stderr.on("data", (d) => (stderr += d))

    child.on("error", (err) => {
      clearAllTimers()
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        reject(new Error("Claude CLI not found. Please install it first and ensure it's in your PATH."))
      } else {
        reject(new Error(`Failed to spawn Claude CLI (${context}): ${err.message}`))
      }
    })

    child.on("close", (code) => {
      clearAllTimers()
      if (code !== 0) {
        let errorMsg = `Claude CLI failed (exit ${code}).`
        const cleanErr = stderr?.trim()
        const cleanOut = stdout?.trim()
        if (cleanErr && cleanOut) {
          errorMsg += ` Error: ${cleanErr} Output: ${cleanOut}`
        } else if (cleanErr) {
          errorMsg += ` Error: ${cleanErr}`
        } else if (cleanOut) {
          errorMsg += ` Output: ${cleanOut}`
        }
        reject(new Error(errorMsg))
        return
      }
      try {
        resolve(parse(stdout))
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        reject(new Error(`Claude CLI returned invalid JSON (${context}): ${msg}`))
      }
    })
  })
}

function runCliForExtraction(provider: CliProvider, prompt: string): Promise<JobExtraction> {
  return runCliCommon<JobExtraction>(
    provider,
    prompt,
    (stdout) => {
      const jobData = parseCliObjectOutput(stdout)
      logger.info(`[CLI] Parsed job data:`, jobData)
      return {
        title: (jobData.title as string) ?? null,
        description: (jobData.description as string) ?? null,
        location: (jobData.location as string) ?? null,
        techStack: (jobData.techStack as string) ?? null,
        companyName: (jobData.companyName as string) ?? null,
      }
    },
    "job-extraction"
  )
}

// ============================================================================
// Form Fill IPC Handler (MCP-based)
// ============================================================================

// Track active Claude CLI process
let activeClaudeProcess: ReturnType<typeof spawn> | null = null

/**
 * Get the path to the MCP server executable
 */
function getMcpServerPath(): string {
  // In development, use the local mcp-server/dist/index.js
  // In production, it would be bundled with the app
  const devPath = path.join(import.meta.dirname, "..", "mcp-server", "dist", "index.js")
  if (fs.existsSync(devPath)) {
    return devPath
  }
  // Fallback for production builds
  const prodPath = path.join(import.meta.dirname, "mcp-server", "index.js")
  if (fs.existsSync(prodPath)) {
    return prodPath
  }
  throw new Error("MCP server not found. Run 'npm run build' in mcp-server directory.")
}

/**
 * Create MCP config file for Claude CLI
 */
function createMcpConfigFile(): string {
  const mcpServerPath = getMcpServerPath()
  const configPath = path.join(os.tmpdir(), `job-applicator-mcp-config-${process.pid}.json`)

  const config = {
    mcpServers: {
      "job-applicator": {
        command: "node",
        args: [mcpServerPath],
        env: {
          JOB_APPLICATOR_URL: `http://127.0.0.1:19524`
        }
      }
    }
  }

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
  logger.info(`[FillForm] Created MCP config at ${configPath}`)
  return configPath
}

/**
 * Fill form using Claude CLI with MCP tools
 */
ipcMain.handle(
  "fill-form",
  async (
    _event: IpcMainInvokeEvent,
    options: { jobMatchId: string; jobContext: string }
  ): Promise<{ success: boolean; message?: string }> => {
    try {
      // Kill any existing process
      if (activeClaudeProcess) {
        activeClaudeProcess.kill()
        activeClaudeProcess = null
      }

      // Fetch the user's profile with explicit error handling
      let profileText: string
      try {
        profileText = await fetchApplicatorProfile()
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        logger.error(`[FillForm] Failed to fetch profile: ${message}`)
        return { success: false, message: `Failed to fetch profile: ${message}` }
      }

      // Create MCP config file
      let mcpConfigPath: string
      try {
        mcpConfigPath = createMcpConfigFile()
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        logger.error(`[FillForm] Failed to create MCP config: ${message}`)
        return { success: false, message }
      }

      // Set job context for document generation tools
      setCurrentJobMatchId(options.jobMatchId)

      // Build the prompt
      const prompt = `You are filling a job application form. Use the MCP tools to interact with the browser.

AVAILABLE TOOLS:
- screenshot: Capture the current page (call first to see what's there)
- click: Click at x,y coordinates
- type: Type text into the focused field
- press_key: Press Tab, Enter, Escape, Backspace, ArrowDown, ArrowUp, Space
- scroll: Scroll the page (positive dy = down)
- get_form_fields: Get all form fields with labels and values
- generate_resume: Generate a tailored resume PDF
- generate_cover_letter: Generate a tailored cover letter PDF
- upload_file: Upload a generated document (type: "resume" or "coverLetter")
- done: Signal completion (include a summary)

RULES:
1. Start with screenshot to see the current page
2. Fill fields using the profile data below - be accurate
3. For file uploads: generate_resume/generate_cover_letter first, then upload_file
4. Call done with a summary when finished
5. DO NOT click submit/apply buttons - user will review and submit

USER PROFILE:
${profileText}

JOB DETAILS:
${options.jobContext}

Begin by taking a screenshot to see the form.`

      logger.info(`[FillForm] Starting Claude CLI for job ${options.jobMatchId}`)

      // Notify renderer that fill is starting
      mainWindow?.webContents.send("agent-status", { state: "working" })

      // Spawn Claude CLI with MCP server configured
      activeClaudeProcess = spawn("claude", [
        "--print",
        "--dangerously-skip-permissions",
        "--mcp-config",
        mcpConfigPath,
        "-p",
        prompt,
      ])

      // Forward stdout to renderer
      activeClaudeProcess.stdout?.on("data", (data: Buffer) => {
        const text = data.toString()
        mainWindow?.webContents.send("agent-output", { text, isError: false })
      })

      // Forward stderr to renderer
      activeClaudeProcess.stderr?.on("data", (data: Buffer) => {
        const text = data.toString()
        logger.warn(`[FillForm] stderr: ${text}`)
        mainWindow?.webContents.send("agent-output", { text, isError: true })
      })

      // Handle process completion
      activeClaudeProcess.on("close", (code: number | null) => {
        logger.info(`[FillForm] Claude CLI exited with code ${code}`)
        activeClaudeProcess = null
        clearJobContext()
        mainWindow?.webContents.send("agent-status", {
          state: code === 0 ? "idle" : "stopped",
        })
      })

      activeClaudeProcess.on("error", (err: Error) => {
        logger.error(`[FillForm] Claude CLI error: ${err.message}`)
        activeClaudeProcess = null
        clearJobContext()
        mainWindow?.webContents.send("agent-status", { state: "stopped" })
        mainWindow?.webContents.send("agent-output", {
          text: `Error: ${err.message}\n`,
          isError: true,
        })
      })

      return { success: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error(`[FillForm] Error: ${message}`)
      return { success: false, message }
    }
  }
)

/**
 * Stop form filling
 */
ipcMain.handle("stop-fill-form", async (): Promise<{ success: boolean }> => {
  if (activeClaudeProcess) {
    activeClaudeProcess.kill()
    activeClaudeProcess = null
  }
  clearJobContext()
  mainWindow?.webContents.send("agent-status", { state: "stopped" })
  return { success: true }
})

// App lifecycle
app.whenReady().then(() => {
  // Start the tool server for MCP communication
  startToolServer()

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

  // Register Ctrl+R to refresh job matches (works even when BrowserView has focus)
  globalShortcut.register("CommandOrControl+R", () => {
    logger.info("Refreshing job matches via global shortcut...")
    mainWindow?.webContents.send("refresh-job-matches")
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
  stopToolServer()
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
