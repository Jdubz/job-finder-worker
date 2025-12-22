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

// Listen for renderer logs forwarded via IPC (logs to both console and file)
ipcMain.on("renderer-log", (_event: unknown, level: string, args: unknown[]) => {
  // Format each arg - objects get JSON stringified for readability
  const formatArg = (a: unknown): string => {
    if (a === null) return "null"
    if (a === undefined) return "undefined"
    if (typeof a === "object") {
      try {
        return JSON.stringify(a)
      } catch {
        return "[Circular object]"
      }
    }
    return String(a)
  }
  const message = args.map(formatArg).join(" ")
  switch (level) {
    case "warn":
      logger.warn(message)
      break
    case "error":
      logger.error(message)
      break
    case "debug":
      logger.debug(message)
      break
    default:
      logger.info(message)
  }
})

// Import shared types and utilities
import type {
  CliProvider,
  JobExtraction,
  GenerationStep,
  GenerationProgress,
} from "./types.js"
import type { JobMatchWithListing, ResumeContent, CoverLetterContent } from "@shared/types"
import {
  buildExtractionPrompt,
  getUserFriendlyErrorMessage,
  parseCliObjectOutput,
} from "./utils.js"

// Tool executor and server
import { startToolServer, stopToolServer, setToolStatusCallback, getToolServerUrl } from "./tool-server.js"
import { setBrowserView, setCurrentJobMatchId, clearJobContext, setCompletionCallback, setUserProfile, setJobContext, setDocumentUrls, setUploadCallback } from "./tool-executor.js"
import { getFormFillPrompt } from "./form-fill-safety.js"
// Typed API client
import {
  fetchApplicatorProfile,
  fetchJobMatches,
  fetchJobMatch,
  findJobMatchByUrl,
  updateJobMatchStatus,
  fetchDocuments,
  startGeneration,
  executeGenerationStep,
  fetchDraftContent,
  submitDocumentReview,
  submitJobToQueue,
  getApiUrl,
} from "./api-client.js"

// Auth manager
import { initiateLogin, logout, restoreSession, getAuthHeaders } from "./auth-manager.js"

// Temp directory for downloaded documents
const TEMP_DOC_DIR = path.join(os.tmpdir(), "job-applicator-docs")

// Timeout for closing orphaned popup windows (5 seconds)
const POPUP_CLEANUP_TIMEOUT_MS = 5000

/**
 * Download a document from the API to a temporary file
 * @param documentUrl - API path like "/api/generator/artifacts/2025-12-11/file.pdf"
 * @returns Local file path to the downloaded document
 */
async function downloadDocument(documentUrl: string): Promise<string> {
  // Ensure temp directory exists
  if (!fs.existsSync(TEMP_DOC_DIR)) {
    fs.mkdirSync(TEMP_DOC_DIR, { recursive: true })
  }

  // Extract and validate filename from URL (prevent path traversal)
  const filename = path.basename(documentUrl)
  if (
    !/^[a-zA-Z0-9._-]+$/.test(filename) ||
    filename === "" ||
    filename === "." ||
    filename === ".."
  ) {
    throw new Error(`Invalid filename extracted from documentUrl: "${filename}"`)
  }
  const tempPath = path.join(TEMP_DOC_DIR, filename)

  // If already downloaded, return cached path
  if (fs.existsSync(tempPath)) {
    logger.info(`[Download] Using cached document: ${tempPath}`)
    return tempPath
  }

  // Validate documentUrl before building full URL (prevent URL manipulation)
  if (!documentUrl.startsWith("/") || documentUrl.includes("://") || documentUrl.includes("..")) {
    throw new Error(`Invalid documentUrl format: "${documentUrl}"`)
  }

  // Build full URL from API base
  const apiUrl = getApiUrl()
  const apiUrlObj = new URL(apiUrl)
  const fullUrl = `${apiUrlObj.origin}${documentUrl}`

  logger.info(`[Download] Downloading document from: ${fullUrl}`)

  const response = await fetch(fullUrl, {
    headers: getAuthHeaders(),
  })
  if (!response.ok) {
    throw new Error(`Failed to download document: ${response.status} ${response.statusText}`)
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  fs.writeFileSync(tempPath, buffer)

  logger.info(`[Download] Saved document to: ${tempPath} (${buffer.length} bytes)`)
  return tempPath
}

// Layout constants
const TOOLBAR_HEIGHT = 60
const SIDEBAR_WIDTH = 300
const CUSTOM_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"

// CLI timeout and warning thresholds
// 5 minutes for complex form fills - increased from 2 minutes (120s) to handle large forms
// Warning intervals help identify if operations are taking unusually long
const CLI_TIMEOUT_MS = 300000 // 5 minutes
const CLI_WARNING_INTERVALS = [30000, 60000, 90000] // Log warnings at 30s, 60s, 90s
const TOOL_SERVER_HEALTH_TIMEOUT_MS = 3000

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
  browserView.webContents.session.setUserAgent(CUSTOM_USER_AGENT)
  logger.info(`[BrowserView] User agent set to Chrome UA to avoid bot/WAF blocks`)

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

    // For about:blank or javascript: URLs, sites often open a blank window
    // and then redirect via JS. We need to allow these to open so we can
    // capture the redirect. Return "allow" and handle in did-create-window.
    if (!url || url === "about:blank" || url.startsWith("javascript:")) {
      logger.info(`Allowing popup for redirect capture: ${url}`)
      return { action: "allow" }
    }

    // For real URLs, navigate in the same BrowserView
    browserView?.webContents.loadURL(url)
    return { action: "deny" }
  })

  // Capture child windows (popups) and redirect their navigation to main BrowserView
  browserView.webContents.on("did-create-window", (childWindow) => {
    logger.info(`Child window created, setting up redirect capture`)

    // Track timeout for cleanup
    let cleanupTimeout: NodeJS.Timeout | null = null

    // Handler for navigation events - close child and redirect to main view
    const handleNavigation = (_event: Electron.Event, url: string) => {
      if (url && url !== "about:blank" && !url.startsWith("javascript:")) {
        logger.info(`Capturing child window navigation: ${url}`)
        browserView?.webContents.loadURL(url)
        childWindow.close()
      }
    }

    // Cleanup function to remove listeners and clear timeout
    const cleanup = () => {
      if (cleanupTimeout) {
        clearTimeout(cleanupTimeout)
        cleanupTimeout = null
      }
      if (!childWindow.isDestroyed()) {
        childWindow.webContents.removeListener("will-navigate", handleNavigation)
        childWindow.webContents.removeListener("did-navigate", handleNavigation)
      }
    }

    // When the child window navigates to a real URL, close it and navigate main view
    childWindow.webContents.on("will-navigate", handleNavigation)

    // Also handle did-navigate for cases where will-navigate doesn't fire
    childWindow.webContents.on("did-navigate", handleNavigation)

    // Clean up listeners when window is closed
    childWindow.on("closed", cleanup)

    // Close after a timeout if no navigation happens (cleanup orphaned windows)
    cleanupTimeout = setTimeout(() => {
      if (!childWindow.isDestroyed()) {
        const url = childWindow.webContents.getURL()
        if (!url || url === "about:blank") {
          logger.info(`Closing orphaned child window`)
          childWindow.close()
        }
      }
    }, POPUP_CLEANUP_TIMEOUT_MS)
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

// Get navigation state (URL + back availability)
ipcMain.handle("get-navigation-state", async (): Promise<{ url: string; canGoBack: boolean }> => {
  if (!browserView) return { url: "", canGoBack: false }
  return {
    url: browserView.webContents.getURL(),
    canGoBack: browserView.webContents.canGoBack(),
  }
})

// Navigate back if possible
ipcMain.handle("go-back", async (): Promise<{ success: boolean; canGoBack: boolean; message?: string }> => {
  if (!browserView) {
    return { success: false, canGoBack: false, message: "Browser not initialized" }
  }
  if (browserView.webContents.canGoBack()) {
    await browserView.webContents.goBack()
    return { success: true, canGoBack: browserView.webContents.canGoBack() }
  }
  return { success: false, canGoBack: false, message: "No page to go back to" }
})


type PageFrameTreeNode = { frame: { id: string; url: string }; childFrames?: PageFrameTreeNode[] }

const MIN_FRAME_URL_MATCH_SCORE = 40

function scoreFrameUrlMatch(candidateUrl: string, targetUrl: string): number {
  try {
    const candidate = new URL(candidateUrl)
    const target = new URL(targetUrl)

    // Exact match (including query) is best.
    if (candidate.href === target.href) return 100

    // Same origin is a strong signal.
    if (candidate.origin === target.origin) {
      if (candidate.pathname === target.pathname) return 90
      if (candidate.pathname.startsWith(target.pathname) || target.pathname.startsWith(candidate.pathname)) return 80
      return 70
    }

    // Weak match: same hostname and overlapping path.
    if (
      candidate.hostname === target.hostname &&
      (candidate.pathname.includes(target.pathname) || target.pathname.includes(candidate.pathname))
    ) {
      return 40
    }
  } catch {
    // ignore URL parse errors
  }

  return 0
}

async function findCdpFrameIdForUrl(debugger_: Electron.Debugger, frameUrl: string): Promise<{
  mainFrameId: string | null
  frameId: string | null
}> {
  const { frameTree } = await debugger_.sendCommand("Page.getFrameTree", {}) as { frameTree: PageFrameTreeNode }

  const mainFrameId = frameTree?.frame?.id || null
  let bestId: string | null = null
  let bestScore = 0

  // Use an explicit stack so TS can see mutations (avoids relying on nested function analysis).
  const stack: PageFrameTreeNode[] = frameTree ? [frameTree] : []

  while (stack.length > 0) {
    const node = stack.pop()!
    const score = scoreFrameUrlMatch(node.frame.url, frameUrl)
    if (score > bestScore) {
      bestScore = score
      bestId = node.frame.id
    }
    for (const child of node.childFrames || []) stack.push(child)
  }

  const frameId = bestScore >= MIN_FRAME_URL_MATCH_SCORE ? bestId : null
  return { mainFrameId, frameId }
}

// Helper function to set files on a file input using Electron's debugger API.
// Supports file inputs within cross-origin iframes by targeting the correct subframe document.
async function setFileInputFiles(
  webContents: WebContents,
  selector: string,
  filePaths: string[],
  frameUrl?: string | null
): Promise<void> {
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
    // Always start from the main document node; we may swap to a subframe document below.
    const { root } = await debugger_.sendCommand("DOM.getDocument", {}) as { root: { nodeId: number } }
    let queryRootNodeId = root.nodeId

    // If we know (or can infer) the frame URL for the selector, query within that frame's document.
    if (frameUrl) {
      try {
        const { mainFrameId, frameId } = await findCdpFrameIdForUrl(debugger_, frameUrl)
        if (frameId && mainFrameId && frameId !== mainFrameId) {
          const owner = await debugger_.sendCommand("DOM.getFrameOwner", { frameId }) as {
            backendNodeId?: number
            nodeId?: number
          }

          let describeParams: { nodeId?: number; backendNodeId?: number } | null = null
          if (typeof owner.nodeId === "number") {
            describeParams = { nodeId: owner.nodeId }
          } else if (typeof owner.backendNodeId === "number") {
            describeParams = { backendNodeId: owner.backendNodeId }
          }

          if (!describeParams) {
            logger.warn(
              `[Upload] Frame owner for selector "${selector}" (frameUrl=${frameUrl}) has no valid nodeId or backendNodeId`,
            )
          } else {
            const described = await debugger_.sendCommand("DOM.describeNode", describeParams) as {
              node: { contentDocument?: { nodeId: number } }
            }

            const contentDocumentNodeId = described.node?.contentDocument?.nodeId
            if (typeof contentDocumentNodeId === "number") {
              queryRootNodeId = contentDocumentNodeId
            }
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        logger.warn(`[Upload] Failed to resolve frame for selector "${selector}" (frameUrl=${frameUrl}): ${message}`)
      }
    }

    // Find the file input element (within chosen document root)
    const { nodeId } = await debugger_.sendCommand("DOM.querySelector", {
      nodeId: queryRootNodeId,
      selector,
    }) as { nodeId: number }

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

// Helper function to find the appropriate file input based on document type
// Analyzes labels, attributes, and nearby text to identify resume vs cover letter inputs
function buildFileInputDetectionScript(targetType: "resume" | "coverLetter"): string {
  return `
    (() => {
      const fileInputs = document.querySelectorAll('input[type="file"]');
      if (fileInputs.length === 0) return null;

      // Keywords to identify each document type
      const resumeKeywords = ['resume', 'cv', 'curriculum'];
      const coverLetterKeywords = ['cover', 'letter', 'coverletter', 'cover-letter', 'cover_letter'];
      const targetType = '${targetType}';
      const targetKeywords = targetType === 'coverLetter' ? coverLetterKeywords : resumeKeywords;
      const otherKeywords = targetType === 'coverLetter' ? resumeKeywords : coverLetterKeywords;

      // Helper to check if text contains any keywords
      function containsKeyword(text, keywords) {
        if (!text) return false;
        const lower = text.toLowerCase();
        return keywords.some(kw => lower.includes(kw));
      }

      // Helper to get associated text for a file input
      function getAssociatedText(input) {
        const texts = [];

        // Check id and name attributes
        if (input.id) texts.push(input.id);
        if (input.name) texts.push(input.name);
        if (input.getAttribute('aria-label')) texts.push(input.getAttribute('aria-label'));
        if (input.getAttribute('placeholder')) texts.push(input.getAttribute('placeholder'));
        if (input.getAttribute('data-testid')) texts.push(input.getAttribute('data-testid'));

        // Check for associated label
        if (input.id) {
          const label = document.querySelector('label[for="' + CSS.escape(input.id) + '"]');
          if (label) texts.push(label.textContent);
        }

        // Check for parent label
        const parentLabel = input.closest('label');
        if (parentLabel) texts.push(parentLabel.textContent);

        // Check nearby text (parent containers, siblings)
        let parent = input.parentElement;
        for (let i = 0; i < 4 && parent; i++) {
          // Get direct text content or nearby labels/spans
          const nearbyLabels = parent.querySelectorAll('label, span, p, div, h1, h2, h3, h4, h5, h6');
          nearbyLabels.forEach(el => {
            if (el.textContent && el.textContent.length < 100) {
              texts.push(el.textContent);
            }
          });
          parent = parent.parentElement;
        }

        return texts.join(' ');
      }

      // Helper to build a unique selector for an input
      function buildSelector(input) {
        if (input.id) return \`#\${CSS.escape(input.id)}\`;
        if (input.name) return \`input[type="file"][name="\${CSS.escape(input.name)}"]\`;

        // Build an nth-of-type selector as fallback
        const allInputs = Array.from(document.querySelectorAll('input[type="file"]'));
        const index = allInputs.indexOf(input);
        if (index >= 0) return \`input[type="file"]:nth-of-type(\${index + 1})\`;

        return 'input[type="file"]';
      }

      // Score each input for both document types
      const scored = Array.from(fileInputs).map((input, index) => {
        const text = getAssociatedText(input);
        const matchesTarget = containsKeyword(text, targetKeywords);
        const matchesOther = containsKeyword(text, otherKeywords);

        return {
          input,
          index,
          selector: buildSelector(input),
          matchesTarget,
          matchesOther,
          text: text.length > 200 ? text.substring(0, 200) + '...' : text // For debugging
        };
      });

      // Priority 1: Find an input that matches target and NOT other type
      let match = scored.find(s => s.matchesTarget && !s.matchesOther);
      if (match) return match.selector;

      // Priority 2: Find an input that matches target (even if ambiguous)
      match = scored.find(s => s.matchesTarget);
      if (match) return match.selector;

      // Priority 3: Find an input that doesn't match the other type
      // (For resume: prefer inputs not labeled as cover letter)
      // (For cover letter: prefer inputs not labeled as resume)
      const notOther = scored.filter(s => !s.matchesOther);
      if (notOther.length > 0) {
        // For cover letter, take the second non-resume input if available
        // (assumes resume input typically comes first)
        if (targetType === 'coverLetter' && notOther.length > 1) {
          return notOther[1].selector;
        }
        // For resume (or cover letter with only one option), take the first
        return notOther[0].selector;
      }

      // Priority 4: Fallback based on position
      // Resume is typically first, cover letter second
      if (targetType === 'coverLetter' && scored.length > 1) {
        return scored[1].selector;
      }
      return scored[0].selector;
    })()
  `
}

// Upload resume/document to form using Electron's debugger API (CDP)
ipcMain.handle(
  "upload-resume",
  async (
    _event: IpcMainInvokeEvent,
    options?: { documentUrl?: string; type?: "resume" | "coverLetter" }
  ): Promise<{ success: boolean; message: string; filePath?: string }> => {
    let resolvedPath: string | null = null

    try {
      if (!browserView) throw new Error("BrowserView not initialized")

      // Find file input selector based on document type
      const targetType = options?.type || "resume"
      const fileInputSelector = await browserView.webContents.executeJavaScript(
        buildFileInputDetectionScript(targetType)
      )

      if (!fileInputSelector) {
        return { success: false, message: "No file input found on page" }
      }

      logger.info(`[Upload] Found file input for ${targetType}: ${fileInputSelector}`)

      // Download document from API
      if (!options?.documentUrl) {
        return { success: false, message: "No document URL provided" }
      }

      logger.info(`[Upload] Downloading document from API: ${options.documentUrl}`)
      resolvedPath = await downloadDocument(options.documentUrl)

      // Use Electron's debugger API to set the file
      logger.info(`[Upload] Uploading file: ${resolvedPath} to ${fileInputSelector}`)
      await setFileInputFiles(browserView.webContents, fileInputSelector, [resolvedPath])

      const docTypeLabel = options?.type === "coverLetter" ? "Cover letter" : "Resume"
      return { success: true, message: `${docTypeLabel} uploaded successfully`, filePath: resolvedPath }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error("[Upload] Error:", message)
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

        // Check for awaiting_review status - pause generation and notify renderer
        if (stepResult.status === "awaiting_review") {
          logger.info("Generation paused for review")

          // Update steps from result
          if (stepResult.steps) {
            currentSteps = stepResult.steps
          }

          // Send review-needed event to renderer
          if (mainWindow) {
            mainWindow.webContents.send("generation-awaiting-review", {
              requestId,
              status: "awaiting_review",
              steps: currentSteps,
              resumeUrl: stepResult.resumeUrl,
              coverLetterUrl: stepResult.coverLetterUrl,
            })
          }

          // Return with awaiting_review status - renderer will handle showing review form
          return {
            success: true,
            data: {
              requestId,
              status: "awaiting_review",
              steps: currentSteps,
              resumeUrl: stepResult.resumeUrl,
              coverLetterUrl: stepResult.coverLetterUrl,
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

// Fetch draft content for document review
ipcMain.handle(
  "fetch-draft-content",
  async (_event: IpcMainInvokeEvent, requestId: string) => {
    try {
      const draft = await fetchDraftContent(requestId)
      return { success: true, data: draft }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error("Failed to fetch draft content:", message)
      return { success: false, message }
    }
  }
)

// Submit document review and continue generation
ipcMain.handle(
  "submit-document-review",
  async (
    _event: IpcMainInvokeEvent,
    options: {
      requestId: string
      documentType: "resume" | "coverLetter"
      content: ResumeContent | CoverLetterContent
    }
  ): Promise<{
    success: boolean
    data?: GenerationProgress
    message?: string
  }> => {
    try {
      logger.info(`Submitting document review for ${options.documentType}`)

      // Submit the review
      const stepResult = await submitDocumentReview(
        options.requestId,
        options.documentType,
        options.content
      )

      // If still awaiting review (e.g., for both documents), return that status
      if (stepResult.status === "awaiting_review") {
        if (mainWindow) {
          mainWindow.webContents.send("generation-awaiting-review", {
            requestId: options.requestId,
            status: "awaiting_review",
            steps: stepResult.steps,
          })
        }
        return {
          success: true,
          data: {
            requestId: options.requestId,
            status: "awaiting_review",
            steps: stepResult.steps || [],
          },
        }
      }

      // Continue executing remaining steps
      let nextStep = stepResult.nextStep
      let currentSteps = stepResult.steps || []
      let resumeUrl = stepResult.resumeUrl
      let coverLetterUrl = stepResult.coverLetterUrl
      let stepCount = 0

      while (nextStep && stepCount < MAX_GENERATION_STEPS) {
        stepCount++

        // Send progress update
        if (mainWindow) {
          mainWindow.webContents.send("generation-progress", {
            requestId: options.requestId,
            status: "processing",
            steps: currentSteps,
            currentStep: nextStep,
            resumeUrl,
            coverLetterUrl,
          })
        }

        logger.info(`Executing step after review: ${nextStep}`)
        const result = await executeGenerationStep(options.requestId)

        if (result.status === "failed") {
          return {
            success: false,
            message: result.error || "Generation step failed after review",
            data: {
              requestId: options.requestId,
              status: "failed",
              steps: result.steps || currentSteps,
              error: result.error,
            },
          }
        }

        // Check for another review pause
        if (result.status === "awaiting_review") {
          if (mainWindow) {
            mainWindow.webContents.send("generation-awaiting-review", {
              requestId: options.requestId,
              status: "awaiting_review",
              steps: result.steps || currentSteps,
            })
          }
          return {
            success: true,
            data: {
              requestId: options.requestId,
              status: "awaiting_review",
              steps: result.steps || currentSteps,
            },
          }
        }

        if (result.steps) currentSteps = result.steps
        if (result.resumeUrl) resumeUrl = result.resumeUrl
        if (result.coverLetterUrl) coverLetterUrl = result.coverLetterUrl
        nextStep = result.nextStep
      }

      // Generation completed
      if (mainWindow) {
        mainWindow.webContents.send("generation-progress", {
          requestId: options.requestId,
          status: "completed",
          steps: currentSteps,
          resumeUrl,
          coverLetterUrl,
        })
      }

      logger.info("Generation completed after review")
      return {
        success: true,
        data: {
          requestId: options.requestId,
          status: "completed",
          steps: currentSteps,
          resumeUrl,
          coverLetterUrl,
        },
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error("Submit review error:", message)
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
    const child = spawn(cmd, args, {
      windowsHide: true,
    })
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
 * Kill the active Claude CLI process if running
 * Uses process group kill to ensure all child processes are terminated
 * (e.g., codex spawns a child process that would otherwise be orphaned)
 */
function killActiveClaudeProcess(reason: string): void {
  if (!activeClaudeProcess) return

  // Capture reference before nullifying - needed for timeout callback
  const processToKill = activeClaudeProcess
  const pid = processToKill.pid
  logger.info(`[Process] Killing Claude CLI process group (PID: ${pid}) - ${reason}`)

  // Nullify immediately to prevent new operations on this process
  activeClaudeProcess = null

  if (!pid) {
    logger.warn(`[Process] No PID available for process`)
    return
  }

  try {
    // Kill the entire process group (spawned with detached: true)
    // Negative PID kills the process group
    try {
      process.kill(-pid, "SIGTERM")
    } catch {
      // If process group kill fails, fall back to direct kill
      processToKill.kill("SIGTERM")
    }

    // Force kill after 2 seconds if still running
    const forceKillTimeout = setTimeout(() => {
      if (!processToKill.killed) {
        logger.warn(`[Process] SIGTERM didn't work, sending SIGKILL to process group ${pid}`)
        try {
          process.kill(-pid, "SIGKILL")
        } catch {
          try {
            processToKill.kill("SIGKILL")
          } catch {
            // Process may have exited between check and kill
          }
        }
      }
    }, 2000)

    // Clear timeout if process exits
    processToKill.once("exit", () => {
      clearTimeout(forceKillTimeout)
      logger.info(`[Process] Claude CLI (PID: ${pid}) exited`)
    })
  } catch (err) {
    logger.error(`[Process] Error killing Claude CLI: ${err}`)
  }
}

// Clean up on unexpected process exit (safety net for crashes)
process.on("exit", () => {
  if (activeClaudeProcess) {
    try {
      activeClaudeProcess.kill("SIGKILL")
    } catch {
      // Ignore errors during exit
    }
  }
})

// Handle SIGTERM/SIGINT explicitly for electronmon restarts
// These signals are sent when electronmon restarts the app on file changes
const handleTerminationSignal = (signal: string) => {
  logger.info(`[Process] Received ${signal}, cleaning up child processes...`)
  if (activeClaudeProcess) {
    try {
      // Kill the entire process group to catch any grandchildren
      const pid = activeClaudeProcess.pid
      if (pid) {
        try {
          // Try to kill the process group (negative PID)
          process.kill(-pid, "SIGKILL")
        } catch {
          // If process group kill fails, kill the process directly
          activeClaudeProcess.kill("SIGKILL")
        }
      }
      logger.info(`[Process] Killed child process on ${signal}`)
    } catch (err) {
      logger.error(`[Process] Error killing child on ${signal}:`, err)
    }
    activeClaudeProcess = null
  }
  // Exit after cleanup
  process.exit(0)
}

process.on("SIGTERM", () => handleTerminationSignal("SIGTERM"))
process.on("SIGINT", () => handleTerminationSignal("SIGINT"))

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
// MCP config path - stored in project dir for easier debugging
const MCP_CONFIG_PATH = path.join(import.meta.dirname, "..", "mcp-config.json")

function createMcpConfigFile(): string {
  const mcpServerPath = getMcpServerPath()
  // Use forward slashes for better cross-platform compatibility
  const normalizedPath = mcpServerPath.replace(/\\/g, "/")

  // On Windows, use node directly - windowsHide should be handled by Claude CLI
  // On other platforms, use node normally
  const config = {
    mcpServers: {
      "job-applicator": {
        command: "node",
        args: [normalizedPath],
        env: {
          JOB_APPLICATOR_URL: getToolServerUrl()
        }
      }
    }
  }

  const configJson = JSON.stringify(config, null, 2)
  fs.writeFileSync(MCP_CONFIG_PATH, configJson)
  logger.info(`[FillForm] Created MCP config at ${MCP_CONFIG_PATH}`)
  logger.info(`[FillForm] MCP config contents:\n${configJson}`)
  logger.info(`[FillForm] Tool server URL: ${getToolServerUrl()}`)

  // Verify the file was written correctly
  const written = fs.readFileSync(MCP_CONFIG_PATH, 'utf-8')
  if (written !== configJson) {
    logger.error(`[FillForm] MCP config file mismatch! Expected ${configJson.length} chars, got ${written.length}`)
  }

  return MCP_CONFIG_PATH
}

/**
 * Ensure MCP server build artifacts exist
 */
function assertMcpServerBuilt(): void {
  try {
    const pathToServer = getMcpServerPath()
    logger.info(`[Startup] MCP server binary found at: ${pathToServer}`)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error(`[Startup] MCP server missing: ${message}`)
    throw err
  }
}

/**
 * Health-check the tool server endpoint (fast fail for port conflicts/unstarted server)
 */
async function ensureToolServerHealthy(): Promise<void> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TOOL_SERVER_HEALTH_TIMEOUT_MS)
  const url = `${getToolServerUrl()}/tool`

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tool: "__healthcheck__", params: {} }),
      signal: controller.signal,
    })

    if (!res.ok) {
      throw new Error(`Tool server responded ${res.status}`)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`Tool server not reachable at ${url}: ${message}`)
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Restart tool server if health check fails, then re-validate.
 */
async function ensureToolServerReadyWithRestart(): Promise<void> {
  try {
    await ensureToolServerHealthy()
    return
  } catch (initialErr) {
    logger.warn(`[ToolServer] Health check failed, restarting: ${initialErr instanceof Error ? initialErr.message : String(initialErr)}`)
    try {
      await stopToolServer()
    } catch {
      /* ignore */
    }
    startToolServer()
    await ensureToolServerHealthy()
  }
}

/**
 * Fill form using Claude CLI with MCP tools
 */
let fillFormInProgress = false

ipcMain.handle(
  "fill-form",
  async (
    _event: IpcMainInvokeEvent,
    options: { jobMatchId: string; jobContext: string; resumeUrl?: string; coverLetterUrl?: string }
  ): Promise<{ success: boolean; message?: string }> => {
    // Prevent multiple simultaneous fill-form calls
    if (fillFormInProgress) {
      logger.warn(`[FillForm] Ignoring duplicate call - fill already in progress`)
      return { success: false, message: "Form fill already in progress" }
    }
    fillFormInProgress = true

    try {
      // Fast preflight: make sure the tool server is reachable before starting the agent
      try {
        logger.info(`[FillForm] Checking tool server at ${getToolServerUrl()}`)
        await ensureToolServerReadyWithRestart()
        logger.info(`[FillForm] Tool server is healthy`)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        logger.error(`[FillForm] Tool server health check failed: ${message}`)
        fillFormInProgress = false
        return { success: false, message: `Tool server not ready: ${message}. Try restarting the app.` }
      }

      // Verify MCP server exists
      try {
        const mcpPath = getMcpServerPath()
        logger.info(`[FillForm] MCP server path: ${mcpPath}`)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        logger.error(`[FillForm] MCP server not found: ${message}`)
        fillFormInProgress = false
        return { success: false, message: `MCP server not found: ${message}. Run 'npm run build'.` }
      }

      // Kill any existing process
      if (activeClaudeProcess) {
        killActiveClaudeProcess("starting new fill-form")
      } else {
        logger.info(`[FillForm] No existing process to kill`)
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

      // Set job context for document generation tools and context retrieval
      setCurrentJobMatchId(options.jobMatchId)
      setUserProfile(profileText)
      setJobContext(options.jobContext)

      // Set document URLs for the upload_file tool
      setDocumentUrls({
        resumeUrl: options.resumeUrl,
        coverLetterUrl: options.coverLetterUrl,
      })

      // Set upload callback - this allows the tool executor to trigger uploads
      setUploadCallback(async (selector: string, type: "resume" | "coverLetter", documentUrl: string, frameUrl?: string | null) => {
        const docTypeLabel = type === "coverLetter" ? "Cover letter" : "Resume"

        try {
          if (!browserView) {
            return { success: false, message: "BrowserView not initialized" }
          }

          logger.info(`[Upload] Agent uploading ${type}: ${documentUrl} to ${selector}`)

          // Download document from API
          const resolvedPath = await downloadDocument(documentUrl)

          // Use Electron's debugger API to set the file
          await setFileInputFiles(browserView.webContents, selector, [resolvedPath], frameUrl)

          return { success: true, message: `${docTypeLabel} uploaded successfully to ${selector}` }
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err)
          const contextMsg = `Failed to upload ${docTypeLabel} to "${selector}": ${errMsg}`
          logger.error(`[Upload] ${contextMsg}`)
          return { success: false, message: contextMsg }
        }
      })

      // Set completion callback to kill CLI when done is called
      logger.info(`[FillForm] Setting completion callback`)
      setCompletionCallback((summary: string) => {
        logger.info(`[FillForm] Completion callback fired with: ${summary}`)
        killActiveClaudeProcess("agent completed")
        clearJobContext()
        setCompletionCallback(null)
        setToolStatusCallback(null)
        mainWindow?.webContents.send("agent-status", { state: "idle" })
        mainWindow?.webContents.send("agent-output", {
          text: `\n✓ ${summary}\n`,
          isError: false,
        })
      })

      // Get complete form fill prompt (workflow + safety rules)
      // The prompt is now hardcoded in the Electron app - see form-fill-safety.ts
      const prompt = getFormFillPrompt()
      logger.info(`[FillForm] Loaded prompt (${prompt.length} chars total)`)

      logger.info(`[FillForm] Starting Claude CLI for job ${options.jobMatchId}`)
      logger.info(`[FillForm] MCP config path: ${mcpConfigPath}`)
      logger.info(`[FillForm] Prompt length: ${prompt.length} chars`)

      // Notify renderer that fill is starting
      mainWindow?.webContents.send("agent-status", { state: "working" })

      // Set up tool status callback to forward to renderer
      setToolStatusCallback((message: string) => {
        mainWindow?.webContents.send("agent-output", { text: message + "\n", isError: false })
      })

      // Spawn Claude CLI with MCP server configured
      // Use stdin for prompt to avoid command line length limits
      // --strict-mcp-config ensures ONLY our MCP server is used (ignores system configs)
      // --debug shows MCP connection details for troubleshooting
      const spawnArgs = [
        "--print",
        "--dangerously-skip-permissions",
        "--mcp-config",
        mcpConfigPath,
        "--strict-mcp-config",
        "--debug",
      ]
      logger.info(`[FillForm] Spawning: claude ${spawnArgs.join(" ")} (prompt via stdin)`)
      // Platform-specific spawn options:
      // - Windows: shell:true + windowsHide:true hides console; detached:false avoids visible window
      // - Unix: detached:true enables process group killing via negative PID (-pid)
      const isWindows = process.platform === "win32"
      activeClaudeProcess = spawn("claude", spawnArgs, {
        detached: !isWindows,
        shell: isWindows,
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      })

      // Write prompt to stdin and close it (--print mode needs EOF to start)
      if (activeClaudeProcess.stdin) {
        activeClaudeProcess.stdin.write(prompt)
        activeClaudeProcess.stdin.end()
        logger.info(`[FillForm] Wrote ${prompt.length} chars to stdin`)
      } else {
        logger.error(`[FillForm] stdin not available`)
      }

      // Forward stdout to renderer - log full output to see agent reasoning
      activeClaudeProcess.stdout?.on("data", (data: Buffer) => {
        const text = data.toString()
        // Log full output (up to 2000 chars) to see Claude's reasoning
        logger.info(`[FillForm] stdout:\n${text.slice(0, 2000)}${text.length > 2000 ? "...(truncated)" : ""}`)
        mainWindow?.webContents.send("agent-output", { text, isError: false })
      })

      // Forward stderr to renderer
      activeClaudeProcess.stderr?.on("data", (data: Buffer) => {
        const text = data.toString()
        logger.warn(`[FillForm] stderr:\n${text.slice(0, 2000)}${text.length > 2000 ? "...(truncated)" : ""}`)
        mainWindow?.webContents.send("agent-output", { text, isError: true })
      })

      // Log when process actually starts
      logger.info(`[FillForm] Claude CLI process spawned with PID: ${activeClaudeProcess.pid}`)

      // Handle process completion
      activeClaudeProcess.on("close", (code: number | null) => {
        logger.info(`[FillForm] Claude CLI exited with code ${code}`)
        activeClaudeProcess = null
        fillFormInProgress = false
        clearJobContext()
        setCompletionCallback(null)
        setToolStatusCallback(null)
        mainWindow?.webContents.send("agent-status", {
          state: code === 0 ? "idle" : "stopped",
        })
      })

      activeClaudeProcess.on("error", (err: Error) => {
        logger.error(`[FillForm] Claude CLI error: ${err.message}`)
        activeClaudeProcess = null
        fillFormInProgress = false
        clearJobContext()
        setCompletionCallback(null)
        setToolStatusCallback(null)
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
  logger.info(`[FillForm] stop-fill-form called`)
  killActiveClaudeProcess("user stopped")
  clearJobContext()
  setCompletionCallback(null)
  setToolStatusCallback(null)
  mainWindow?.webContents.send("agent-status", { state: "stopped" })
  return { success: true }
})

/**
 * Send input to the running agent
 * Note: This only works in interactive mode, not --print mode
 */
ipcMain.handle(
  "send-agent-input",
  async (_event: IpcMainInvokeEvent, input: string): Promise<{ success: boolean; message?: string }> => {
    if (!activeClaudeProcess) {
      return { success: false, message: "No active agent process" }
    }

    // In --print mode, stdin is closed after the initial prompt
    // This handler is for future interactive mode support
    if (!activeClaudeProcess.stdin || activeClaudeProcess.stdin.writableEnded) {
      return { success: false, message: "Agent stdin is closed (--print mode does not support interactive input)" }
    }

    try {
      activeClaudeProcess.stdin.write(input + "\n")
      logger.info(`[FillForm] Sent input to agent: ${input.slice(0, 100)}${input.length > 100 ? "..." : ""}`)
      return { success: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error(`[FillForm] Failed to send input: ${message}`)
      return { success: false, message }
    }
  }
)

/**
 * Pause the running agent (send SIGTSTP signal)
 * Note: In --print mode, this sends a signal rather than Escape via stdin
 */
ipcMain.handle("pause-agent", async (): Promise<{ success: boolean; message?: string }> => {
  if (!activeClaudeProcess) {
    return { success: false, message: "No active agent process" }
  }

  try {
    // Send SIGTSTP to pause the process (like Ctrl+Z in terminal)
    activeClaudeProcess.kill("SIGTSTP")
    logger.info("[FillForm] Sent SIGTSTP to pause agent")
    mainWindow?.webContents.send("agent-status", { state: "paused" })
    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error(`[FillForm] Failed to pause agent: ${message}`)
    return { success: false, message }
  }
})

// ============================================================================
// Auth IPC Handlers
// ============================================================================

// Login handler - opens OAuth popup
ipcMain.handle("auth-login", async (): Promise<{
  success: boolean
  user?: { email: string; name?: string }
  message?: string
}> => {
  try {
    const result = await initiateLogin(mainWindow)
    return { success: result.success, user: result.user, message: result.message }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error(`[Auth] Login failed: ${message}`)
    return { success: false, message }
  }
})

// Logout handler
ipcMain.handle("auth-logout", async (): Promise<{ success: boolean }> => {
  try {
    await logout()
    return { success: true }
  } catch (err) {
    logger.error(`[Auth] Logout failed:`, err)
    return { success: true } // Always clear local state even if API call fails
  }
})

// Get current auth state
ipcMain.handle("auth-get-user", async (): Promise<{
  authenticated: boolean
  user?: { email: string; name?: string }
}> => {
  try {
    const user = await restoreSession()
    return { authenticated: !!user, user: user || undefined }
  } catch {
    return { authenticated: false }
  }
})

// App lifecycle
app.whenReady().then(async () => {
  // Ensure MCP assets exist before the user tries to fill a form
  try {
    assertMcpServerBuilt()
  } catch {
    // Already logged; keep starting the app so the user can see the error in UI/logs
  }

  // Start the tool server for MCP communication
  startToolServer()

  // Verify the tool server is reachable (catches port conflicts/zombie listeners)
  try {
    await ensureToolServerReadyWithRestart()
    logger.info("[Startup] Tool server health check passed")
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error(`[Startup] Tool server health check failed: ${message}`)
  }

  await createWindow()

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
  killActiveClaudeProcess("app quitting")
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
