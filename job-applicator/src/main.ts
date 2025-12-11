import { app, BrowserWindow, BrowserView, ipcMain, IpcMainInvokeEvent, globalShortcut, Menu, shell } from "electron"
import type { WebContents, RenderProcessGoneDetails } from "electron"
import { spawn } from "child_process"
import * as readline from "readline"
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
  FormField,
  EnhancedFillInstruction,
  FormFillSummary,
  FormFillProgress,
  JobExtraction,
  GenerationStep,
  GenerationProgress,
} from "./types.js"
import { getCliCommand, getStreamingCliCommand } from "./cli-config.js"
import type { JobMatchWithListing } from "@shared/types"
import {
  resolveDocumentPath,
  buildPromptFromProfileText,
  buildExtractionPrompt,
  getUserFriendlyErrorMessage,
  parseCliArrayOutput,
  parseCliObjectOutput,
} from "./utils.js"
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
  API_URL,
} from "./api-client.js"

// Artifacts directory - must match backend's GENERATOR_ARTIFACTS_DIR
const ARTIFACTS_DIR = process.env.GENERATOR_ARTIFACTS_DIR || "/data/artifacts"

// Layout constants
const TOOLBAR_HEIGHT = 60
const SIDEBAR_WIDTH = 300

// CLI timeout and warning thresholds
// 2 minutes for complex form fills - increased from 60s to handle large forms
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

/**
 * Robust form field filling that works with React/Vue/Angular controlled inputs.
 *
 * The problem: Modern frameworks like React intercept the native `value` setter.
 * Simply setting `el.value = "x"` only updates the DOM, not React's internal state.
 * When the user interacts with the form, React re-renders using its state (which is
 * still empty), wiping out all manually-set values.
 *
 * The solution: Use the native HTMLInputElement value setter to bypass React's
 * interception, then dispatch proper events to notify the framework of the change.
 *
 * References:
 * - https://coryrylan.com/blog/trigger-input-updates-with-react-controlled-inputs
 * - https://github.com/facebook/react/issues/1152
 */
async function fillFormField(
  webContents: WebContents,
  selector: string,
  value: string,
  fieldType?: string
): Promise<boolean> {
  const safeSelector = JSON.stringify(selector)
  const safeValue = JSON.stringify(value)

  // Handle checkboxes and radio buttons differently
  if (fieldType === "checkbox" || fieldType === "radio") {
    return await webContents.executeJavaScript(`
      (() => {
        const el = document.querySelector(${safeSelector});
        if (!el) return false;

        const shouldBeChecked = ${safeValue}.toLowerCase() === 'true' ||
                               ${safeValue}.toLowerCase() === 'yes' ||
                               ${safeValue} === '1';

        if (el.checked !== shouldBeChecked) {
          // Use native setter for checked property
          const nativeCheckedSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype, 'checked'
          )?.set;

          if (nativeCheckedSetter) {
            nativeCheckedSetter.call(el, shouldBeChecked);
          } else {
            el.checked = shouldBeChecked;
          }

          // Dispatch click and change events
          el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
        return true;
      })()
    `)
  }

  // Handle select elements
  if (fieldType === "select" || fieldType === "select-one" || fieldType === "select-multiple") {
    return await webContents.executeJavaScript(`
      (() => {
        const el = document.querySelector(${safeSelector});
        if (!el || el.tagName.toLowerCase() !== 'select') return false;

        // Find matching option (case-insensitive, trimmed)
        const targetValue = ${safeValue}.toLowerCase().trim();
        let matchedValue = null;

        for (const opt of el.options) {
          if (opt.value.toLowerCase().trim() === targetValue ||
              opt.textContent?.toLowerCase().trim() === targetValue) {
            matchedValue = opt.value;
            break;
          }
        }

        if (matchedValue === null) {
          // Try partial match if exact match not found
          for (const opt of el.options) {
            if (opt.value.toLowerCase().includes(targetValue) ||
                opt.textContent?.toLowerCase().includes(targetValue)) {
              matchedValue = opt.value;
              break;
            }
          }
        }

        if (matchedValue !== null) {
          el.value = matchedValue;
          el.dispatchEvent(new Event('change', { bubbles: true }));
          el.dispatchEvent(new Event('input', { bubbles: true }));
          return true;
        }

        // If still no match, try setting directly
        el.value = ${safeValue};
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      })()
    `)
  }

  // Handle text inputs, textareas, and other input types
  // This is the critical fix for React controlled inputs
  return await webContents.executeJavaScript(`
    (() => {
      const el = document.querySelector(${safeSelector});
      if (!el) return false;

      const tagName = el.tagName.toLowerCase();
      const isInput = tagName === 'input';
      const isTextarea = tagName === 'textarea';

      if (!isInput && !isTextarea) return false;

      // Focus the element first (important for some frameworks)
      el.focus();

      // Get the native value setter to bypass React's interception
      // React overloads the value setter to track state changes, but we need
      // to bypass that to set the value directly on the DOM element
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value'
      )?.set;
      const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype, 'value'
      )?.set;

      // Use the appropriate native setter
      if (isInput && nativeInputValueSetter) {
        nativeInputValueSetter.call(el, ${safeValue});
      } else if (isTextarea && nativeTextAreaValueSetter) {
        nativeTextAreaValueSetter.call(el, ${safeValue});
      } else {
        // Fallback to direct assignment
        el.value = ${safeValue};
      }

      // Dispatch events to notify React/Vue/Angular of the change
      // InputEvent is more reliable than Event for modern frameworks
      el.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        cancelable: true,
        inputType: 'insertText',
        data: ${safeValue}
      }));

      // Also dispatch change event for frameworks that listen to it
      el.dispatchEvent(new Event('change', { bubbles: true }));

      // Blur to trigger validation and ensure the value is committed
      el.blur();

      return true;
    })()
  `)
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
      // API_URL is like "http://localhost:3000/api"
      // documentPath is like "/api/generator/artifacts/2025-12-11/file.pdf"
      // We need to construct the full URL by using the origin from API_URL
      const apiUrlObj = new URL(API_URL)
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

// Fill form with AI using optimized profile endpoint
// Includes EEO data, job match context, streaming progress, and results tracking
ipcMain.handle(
  "fill-form",
  async (
    _event: IpcMainInvokeEvent,
    options: { provider: CliProvider; jobMatchId?: string; documentId?: string }
  ): Promise<{ success: boolean; data?: FormFillSummary; message?: string }> => {
    const startTime = Date.now()

    try {
      if (!browserView) throw new Error("BrowserView not initialized")

      // Send initial progress
      sendFormFillProgress({
        phase: "starting",
        message: "Preparing to fill form...",
      })

      // 1. Get pre-formatted profile text from optimized applicator endpoint
      logger.info("Fetching applicator profile from backend...")
      sendFormFillProgress({
        phase: "starting",
        message: "Loading your profile...",
      })

      let profileText: string
      try {
        profileText = await fetchApplicatorProfile()
        logger.info(`Received profile text (${profileText.length} chars)`)
      } catch (err) {
        const rawMessage = err instanceof Error ? err.message : String(err)
        logger.error(`Profile fetch failed with raw error: ${rawMessage}`)
        const errorMsg = `Failed to fetch profile: ${getUserFriendlyErrorMessage(err instanceof Error ? err : new Error(rawMessage), logger)}`
        sendFormFillProgress({
          phase: "failed",
          message: errorMsg,
          error: errorMsg,
        })
        throw new Error(errorMsg)
      }

      // Validate profile has content
      if (!profileText || profileText.trim().length < 50) {
        const errorMsg = "Profile data is empty or incomplete. Please configure your profile before filling forms."
        sendFormFillProgress({
          phase: "failed",
          message: errorMsg,
          error: errorMsg,
        })
        throw new Error(errorMsg)
      }

      // 2. Get job match context if provided
      let jobContext: { company?: string; role?: string; matchedSkills?: string[] } | null = null
      if (options.jobMatchId) {
        sendFormFillProgress({
          phase: "starting",
          message: "Loading job details...",
        })
        try {
          const match = await fetchJobMatch(options.jobMatchId)
          jobContext = {
            company: match.listing?.companyName,
            role: match.listing?.title,
            matchedSkills: match.matchedSkills as string[] | undefined,
          }
        } catch (err) {
          logger.warn("Failed to fetch job match data, continuing without it:", err)
        }
      }

      // 3. Extract form fields from page
      logger.info("Extracting form fields...")
      sendFormFillProgress({
        phase: "starting",
        message: "Analyzing form fields...",
      })

      const fields: FormField[] = await browserView.webContents.executeJavaScript(EXTRACT_FORM_SCRIPT)
      logger.info(`Found ${fields.length} form fields`)

      if (fields.length === 0) {
        sendFormFillProgress({
          phase: "failed",
          message: "No form fields found on page",
          error: "No form fields found on page",
        })
        return { success: false, message: "No form fields found on page" }
      }

      // 4. Build prompt
      const prompt = buildPromptFromProfileText(fields, profileText, jobContext)
      logger.info(`Calling ${options.provider} CLI for field mapping...`)

      // 5. Call CLI with streaming progress
      sendFormFillProgress({
        phase: "ai-processing",
        message: "AI is analyzing the form...",
        isStreaming: true,
        totalFields: fields.length,
      })

      // Use streaming CLI for real-time progress updates
      const instructions = await runStreamingCli(
        options.provider,
        prompt,
        (text, isComplete) => {
          sendFormFillProgress({
            phase: "ai-processing",
            message: isComplete ? "AI analysis complete" : "AI is generating fill instructions...",
            streamingText: text,
            isStreaming: !isComplete,
            totalFields: fields.length,
          })
        }
      )
      logger.info(`Got ${instructions.length} fill instructions`)

      // 6. Fill fields with progress updates
      sendFormFillProgress({
        phase: "filling",
        message: "Filling form fields...",
        totalFields: instructions.length,
        processedFields: 0,
      })

      let filledCount = 0
      const skippedFields: Array<{ label: string; reason: string }> = []

      // Create a map of selectors to field types
      const fieldTypeMap = new Map<string, string>()
      for (const field of fields) {
        if (field.selector) {
          fieldTypeMap.set(field.selector, field.type)
        }
      }

      for (let i = 0; i < instructions.length; i++) {
        const instruction = instructions[i]

        if (instruction.status === "skipped") {
          skippedFields.push({
            label: instruction.label || instruction.selector || "Unknown field",
            reason: instruction.reason || "No data available",
          })

          sendFormFillProgress({
            phase: "filling",
            message: `Skipped: ${instruction.label || instruction.selector}`,
            totalFields: instructions.length,
            processedFields: i + 1,
            currentField: {
              label: instruction.label || instruction.selector || "Unknown",
              selector: instruction.selector,
              status: "skipped",
            },
          })
          continue
        }

        if (!instruction.value) continue

        // Send progress before filling
        sendFormFillProgress({
          phase: "filling",
          message: `Filling: ${instruction.label || instruction.selector}`,
          totalFields: instructions.length,
          processedFields: i,
          currentField: {
            label: instruction.label || instruction.selector || "Unknown",
            selector: instruction.selector,
            status: "processing",
          },
        })

        try {
          const fieldType = fieldTypeMap.get(instruction.selector)
          const filled = await fillFormField(
            browserView.webContents,
            instruction.selector,
            instruction.value,
            fieldType
          )
          if (filled) filledCount++

          // Send progress after filling
          sendFormFillProgress({
            phase: "filling",
            message: `Filled: ${instruction.label || instruction.selector}`,
            totalFields: instructions.length,
            processedFields: i + 1,
            currentField: {
              label: instruction.label || instruction.selector || "Unknown",
              selector: instruction.selector,
              status: "filled",
            },
          })
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

      // Send completion
      sendFormFillProgress({
        phase: "completed",
        message: `Filled ${filledCount} of ${fields.length} fields`,
        totalFields: fields.length,
        processedFields: instructions.length,
        summary,
      })

      return { success: true, data: summary }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error("Fill form error:", message)

      sendFormFillProgress({
        phase: "failed",
        message,
        error: message,
      })

      return { success: false, message }
    }
  }
)

/**
 * CLI command configurations for different AI providers.
 *
 * Note: Each CLI has different output formats:
 * - Claude CLI: Returns a wrapper object {"type":"result","result":"[...]"} where "result"
 *   is a string containing the actual JSON (escaped). Must parse wrapper first, then parse result.
 * - Codex/Gemini: Return raw JSON arrays directly.
 *
 * The CLI wrapper functions handle these format differences automatically.
 */
function runCliCommon<T>(
  provider: CliProvider,
  prompt: string,
  parse: (stdout: string) => T,
  context: string
): Promise<T> {
  const [cmd, args] = getCliCommand(provider)

  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args)
    let stdout = ""
    let stderr = ""

    const warningTimers = CLI_WARNING_INTERVALS.map((ms) =>
      setTimeout(() => {
        logger.warn(`[CLI] ${provider} ${context} still running after ${ms / 1000}s...`)
      }, ms)
    )

    const timeout = setTimeout(() => {
      child.kill("SIGTERM")
      reject(new Error(`${provider} CLI timed out after ${CLI_TIMEOUT_MS / 1000}s (${context})`))
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
        reject(new Error(`${provider} CLI not found. Please install it first and ensure it's in your PATH.`))
      } else {
        reject(new Error(`Failed to spawn ${provider} CLI (${context}): ${err.message}`))
      }
    })

    child.on("close", (code) => {
      clearAllTimers()
      if (code !== 0) {
        let errorMsg = `${provider} CLI failed (exit ${code}).`
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
        reject(new Error(`${provider} CLI returned invalid JSON (${context}): ${msg}`))
      }
    })
  })
}

function runEnhancedCli(provider: CliProvider, prompt: string): Promise<EnhancedFillInstruction[]> {
  return runCliCommon<EnhancedFillInstruction[]>(
    provider,
    prompt,
    (stdout) => {
      const parsed = parseCliArrayOutput(stdout)
      if (!Array.isArray(parsed)) {
        throw new Error("CLI did not return an array")
      }
      return (parsed as Array<Record<string, unknown>>).map((item) => ({
        selector: String(item.selector || ""),
        value: item.value != null ? String(item.value) : null,
        status: item.status === "skipped" ? "skipped" : "filled",
        reason: item.reason ? String(item.reason) : undefined,
        label: item.label ? String(item.label) : undefined,
      }))
    },
    "form-fill"
  )
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

/**
 * Streaming CLI runner for form filling with real-time progress updates.
 *
 * Uses Claude CLI's stream-json output format which emits NDJSON:
 * - {"type":"system",...} - Session init
 * - {"type":"stream_event","event":{"type":"content_block_delta","delta":{"text":"..."}}} - Token streaming
 * - {"type":"assistant","message":{...}} - Complete message
 * - {"type":"result","result":"..."} - Final result
 *
 * Falls back to non-streaming for providers that don't support it.
 */
function runStreamingCli(
  provider: CliProvider,
  prompt: string,
  onProgress: (text: string, isComplete: boolean) => void
): Promise<EnhancedFillInstruction[]> {
  const streamingCommand = getStreamingCliCommand(provider)

  // Fall back to non-streaming if provider doesn't support it
  if (!streamingCommand) {
    logger.info(`[CLI] Provider ${provider} doesn't support streaming, using standard mode`)
    return runEnhancedCli(provider, prompt)
  }

  const [cmd, args] = streamingCommand

  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args)
    let accumulatedText = ""
    let finalResult: string | null = null
    let stderr = ""

    const warningTimers = CLI_WARNING_INTERVALS.map((ms) =>
      setTimeout(() => {
        logger.warn(`[CLI] ${provider} streaming still running after ${ms / 1000}s...`)
      }, ms)
    )

    const timeout = setTimeout(() => {
      child.kill("SIGTERM")
      reject(new Error(`${provider} CLI timed out after ${CLI_TIMEOUT_MS / 1000}s (streaming form-fill)`))
    }, CLI_TIMEOUT_MS)

    const clearAllTimers = () => {
      warningTimers.forEach(clearTimeout)
      clearTimeout(timeout)
    }

    // Write prompt to stdin
    child.stdin.write(prompt)
    child.stdin.end()

    // Process stdout line-by-line (NDJSON format)
    const rl = readline.createInterface({
      input: child.stdout,
      crlfDelay: Infinity,
    })

    rl.on("line", (line) => {
      if (!line.trim()) return

      try {
        const event = JSON.parse(line)
        logger.debug(`[CLI Streaming] Event type: ${event.type}`)

        // Handle streaming token deltas
        if (event.type === "stream_event" && event.event?.type === "content_block_delta") {
          const text = event.event.delta?.text
          if (text) {
            accumulatedText += text
            logger.debug(`[CLI Streaming] Delta text (${text.length} chars), total: ${accumulatedText.length}`)
            onProgress(accumulatedText, false)
          }
        }

        // Handle complete assistant message (backup if streaming events missed)
        if (event.type === "assistant" && event.message?.content) {
          const content = event.message.content
          if (Array.isArray(content) && content[0]?.type === "text") {
            accumulatedText = content[0].text
            logger.debug(`[CLI Streaming] Assistant message: ${accumulatedText.length} chars`)
            onProgress(accumulatedText, false)
          }
        }

        // Handle final result
        if (event.type === "result") {
          finalResult = event.result
          logger.info(`[CLI Streaming] Result received: ${finalResult?.length || 0} chars`)
          onProgress(finalResult || accumulatedText, true)
        }
      } catch {
        // Log parse errors but don't fail - might be debug output
        logger.warn(`[CLI] Failed to parse streaming line: ${line.slice(0, 100)}`)
      }
    })

    child.stderr.on("data", (d) => (stderr += d))

    child.on("error", (err) => {
      clearAllTimers()
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        reject(new Error(`${provider} CLI not found. Please install it first and ensure it's in your PATH.`))
      } else {
        reject(new Error(`Failed to spawn ${provider} CLI (streaming form-fill): ${err.message}`))
      }
    })

    child.on("close", (code) => {
      clearAllTimers()

      if (code !== 0) {
        let errorMsg = `${provider} CLI failed (exit ${code}).`
        if (stderr?.trim()) {
          errorMsg += ` Error: ${stderr.trim()}`
        }
        reject(new Error(errorMsg))
        return
      }

      // Parse the final result
      const resultText = finalResult || accumulatedText
      logger.info(`[CLI Streaming] Close - finalResult: ${finalResult?.length || 0}, accumulatedText: ${accumulatedText.length}`)
      logger.debug(`[CLI Streaming] Result text preview: ${resultText?.slice(0, 500)}`)

      if (!resultText) {
        reject(new Error(`${provider} CLI returned no output (streaming form-fill)`))
        return
      }

      try {
        // The result should be a JSON array of instructions
        // Try parsing directly first (streaming might give us clean JSON)
        let parsed: unknown
        try {
          parsed = JSON.parse(resultText)
          logger.debug(`[CLI Streaming] Parsed as direct JSON`)
        } catch {
          // Fall back to array extraction if not clean JSON
          logger.debug(`[CLI Streaming] Direct JSON failed, trying array extraction`)
          parsed = parseCliArrayOutput(resultText)
        }

        if (!Array.isArray(parsed)) {
          logger.error(`[CLI Streaming] Parsed result is not an array: ${typeof parsed}`)
          throw new Error("CLI did not return an array")
        }

        logger.info(`[CLI Streaming] Parsed ${parsed.length} instructions`)

        const instructions = (parsed as Array<Record<string, unknown>>).map((item) => ({
          selector: String(item.selector || ""),
          value: item.value != null ? String(item.value) : null,
          status: (item.status === "skipped" ? "skipped" : "filled") as "filled" | "skipped",
          reason: item.reason ? String(item.reason) : undefined,
          label: item.label ? String(item.label) : undefined,
        }))

        resolve(instructions)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        logger.error(`[CLI Streaming] Parse error: ${msg}`)
        reject(new Error(`${provider} CLI returned invalid JSON (streaming form-fill): ${msg}`))
      }
    })
  })
}

/**
 * Helper to send form fill progress to renderer
 */
function sendFormFillProgress(progress: FormFillProgress): void {
  if (mainWindow) {
    mainWindow.webContents.send("form-fill-progress", progress)
  }
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
