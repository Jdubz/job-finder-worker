/**
 * Tool Executor
 *
 * Implements the browser automation tools for the MCP server.
 * Each tool handler executes an action and returns a result.
 */

import type { BrowserView } from "electron"
import * as crypto from "crypto"
import * as fs from "fs"
import { logger } from "./logger.js"
import {
  startGeneration,
  executeGenerationStep,
  fetchGeneratorRequest,
} from "./api-client.js"
import { resolveDocumentPath, getConfig } from "./utils.js"

// ============================================================================
// Types
// ============================================================================

export interface ToolResult {
  success: boolean
  data?: unknown
  error?: string
}

// ============================================================================
// Configuration
// ============================================================================

const SCREENSHOT_WIDTH = 1280
const TOOL_TIMEOUT_MS = 30000 // 30 second timeout for tool execution
const GENERATION_TIMEOUT_MS = 120000 // 2 minute timeout for document generation

// ============================================================================
// BrowserView Reference
// ============================================================================

let browserView: BrowserView | null = null

/**
 * Set the BrowserView reference for tool handlers
 */
export function setBrowserView(view: BrowserView | null): void {
  browserView = view
  logger.info(`[ToolExecutor] BrowserView ${view ? "set" : "cleared"}`)
}

// ============================================================================
// Completion Callback
// ============================================================================

let completionCallback: ((summary: string) => void) | null = null

/**
 * Set a callback to be invoked when the agent calls "done"
 * This allows the main process to know when to stop the CLI
 */
export function setCompletionCallback(callback: ((summary: string) => void) | null): void {
  completionCallback = callback
}

/**
 * Get the current BrowserView reference
 */
export function getBrowserView(): BrowserView | null {
  return browserView
}

// ============================================================================
// Job Context
// ============================================================================

let currentJobMatchId: string | null = null
let lastGeneratedDocumentId: string | null = null

/**
 * Set the current job match ID for document generation
 */
export function setCurrentJobMatchId(id: string | null): void {
  // Clear last generated document when job changes
  if (id !== currentJobMatchId) {
    lastGeneratedDocumentId = null
  }
  currentJobMatchId = id
  logger.info(`[ToolExecutor] Current job match ID: ${id || "(none)"}`)
}

/**
 * Get the current job match ID
 */
export function getCurrentJobMatchId(): string | null {
  return currentJobMatchId
}

/**
 * Clear job context
 */
export function clearJobContext(): void {
  currentJobMatchId = null
  lastGeneratedDocumentId = null
  logger.info("[ToolExecutor] Job context cleared")
}

// ============================================================================
// Main Tool Executor
// ============================================================================

/**
 * Execute a tool and return the result
 */
export async function executeTool(
  tool: string,
  params: Record<string, unknown> = {}
): Promise<ToolResult> {
  logger.info(`[ToolExecutor] Executing: ${tool}`)

  try {
    const result = await executeToolWithTimeout(tool, params)
    return result
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error(`[ToolExecutor] ${tool} failed: ${message}`)
    return { success: false, error: message }
  }
}

/**
 * Execute tool with appropriate timeout
 */
async function executeToolWithTimeout(
  tool: string,
  params: Record<string, unknown>
): Promise<ToolResult> {
  const isLongRunning = tool === "generate_resume" || tool === "generate_cover_letter"
  const timeoutMs = isLongRunning ? GENERATION_TIMEOUT_MS : TOOL_TIMEOUT_MS

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Tool '${tool}' timed out after ${timeoutMs / 1000}s`))
    }, timeoutMs)

    executeToolInternal(tool, params)
      .then((result) => {
        clearTimeout(timer)
        resolve(result)
      })
      .catch((err) => {
        clearTimeout(timer)
        reject(err)
      })
  })
}

/**
 * Internal tool dispatcher
 */
async function executeToolInternal(
  tool: string,
  params: Record<string, unknown>
): Promise<ToolResult> {
  switch (tool) {
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
      return await handleScroll(params as { dy: number; dx?: number })

    case "keypress":
    case "press_key":
      return await handleKeypress(params as { key: string })

    case "generate_resume":
      return await handleGenerateDocument("resume", params as { jobMatchId?: string })

    case "generate_cover_letter":
      return await handleGenerateDocument("coverLetter", params as { jobMatchId?: string })

    case "upload_file":
      return await handleUploadFile(params as { type: "resume" | "coverLetter"; documentId?: string })

    case "done":
      return handleDone(params as { summary?: string })

    default:
      logger.warn(`[ToolExecutor] Unknown tool: ${tool}`)
      return { success: false, error: `Unknown tool: ${tool}` }
  }
}

// ============================================================================
// Tool Handlers
// ============================================================================

/**
 * Capture a screenshot of the current page
 */
async function handleScreenshot(): Promise<ToolResult> {
  if (!browserView) {
    return { success: false, error: "BrowserView not initialized" }
  }

  const nativeImage = await browserView.webContents.capturePage()
  const size = nativeImage.getSize()

  // Resize to target width if needed
  let resized = nativeImage
  if (size.width > SCREENSHOT_WIDTH) {
    const scale = SCREENSHOT_WIDTH / size.width
    const newHeight = Math.round(size.height * scale)
    resized = nativeImage.resize({ width: SCREENSHOT_WIDTH, height: newHeight, quality: "good" })
  }

  const jpeg = resized.toJPEG(60)
  const base64 = jpeg.toString("base64")
  const hash = crypto.createHash("sha1").update(jpeg).digest("hex").slice(0, 8)

  const finalSize = resized.getSize()
  logger.info(`[ToolExecutor] Screenshot: ${finalSize.width}x${finalSize.height}, hash=${hash}`)

  return {
    success: true,
    data: {
      image: `data:image/jpeg;base64,${base64}`,
      width: finalSize.width,
      height: finalSize.height,
      hash,
    },
  }
}

/**
 * Get form fields from the current page
 */
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
                      'field_' + idx;
        return {
          index: idx,
          type: el.type || el.tagName.toLowerCase(),
          name: el.name || null,
          id: el.id || null,
          label: label,
          value: el.value || '',
          x: Math.round(rect.left + rect.width / 2),
          y: Math.round(rect.top + rect.height / 2),
          required: el.required || false,
          disabled: el.disabled || false,
          visible: rect.width > 0 && rect.height > 0,
        };
      }).filter(f => f.type !== 'hidden' && f.visible);
    })()
  `)

  logger.info(`[ToolExecutor] Found ${fields.length} form fields`)

  return { success: true, data: { fields } }
}

/**
 * Get current page info (URL and title)
 */
async function handleGetPageInfo(): Promise<ToolResult> {
  if (!browserView) {
    return { success: false, error: "BrowserView not initialized" }
  }

  const url = browserView.webContents.getURL()
  const title = await browserView.webContents.executeJavaScript("document.title")

  logger.info(`[ToolExecutor] Page: ${title} (${url})`)

  return { success: true, data: { url, title } }
}

/**
 * Click at coordinates on the page
 */
async function handleClick(params: { x: number; y: number }): Promise<ToolResult> {
  if (!browserView) {
    return { success: false, error: "BrowserView not initialized" }
  }

  const { x, y } = params

  if (typeof x !== "number" || typeof y !== "number") {
    return { success: false, error: "Click requires x and y coordinates" }
  }

  const bounds = browserView.getBounds()
  const scale = bounds.width > SCREENSHOT_WIDTH ? bounds.width / SCREENSHOT_WIDTH : 1

  const scaledX = Math.round(x * scale)
  const scaledY = Math.round(y * scale)

  // Validate coordinates
  if (x < 0 || y < 0 || scaledX > bounds.width || scaledY > bounds.height) {
    return { success: false, error: `Coordinates out of bounds: (${x}, ${y})` }
  }

  const debugger_ = browserView.webContents.debugger

  try {
    debugger_.attach("1.3")
  } catch (err) {
    if (!(err instanceof Error && err.message.includes("Already attached"))) {
      throw err
    }
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

    logger.info(`[ToolExecutor] Clicked (${x}, ${y}) -> scaled (${scaledX}, ${scaledY})`)
    return { success: true }
  } finally {
    try {
      debugger_.detach()
    } catch {
      /* ignore */
    }
  }
}

/**
 * Type text into the focused element
 */
async function handleType(params: { text: string }): Promise<ToolResult> {
  if (!browserView) {
    return { success: false, error: "BrowserView not initialized" }
  }

  const { text } = params

  if (!text || typeof text !== "string") {
    return { success: false, error: "Type requires text parameter" }
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
    if (!(err instanceof Error && err.message.includes("Already attached"))) {
      throw err
    }
  }

  try {
    await debugger_.sendCommand("Input.insertText", { text })
    logger.info(`[ToolExecutor] Typed ${text.length} characters`)
    return { success: true }
  } finally {
    try {
      debugger_.detach()
    } catch {
      /* ignore */
    }
  }
}

/**
 * Scroll the page
 */
async function handleScroll(params: { dy: number; dx?: number }): Promise<ToolResult> {
  if (!browserView) {
    return { success: false, error: "BrowserView not initialized" }
  }

  const { dy, dx = 0 } = params

  if (typeof dy !== "number") {
    return { success: false, error: "Scroll requires dy parameter" }
  }

  await browserView.webContents.executeJavaScript(`window.scrollBy(${dx}, ${dy})`)
  logger.info(`[ToolExecutor] Scrolled by (${dx}, ${dy})`)

  return { success: true }
}

/**
 * Press a special key
 */
async function handleKeypress(params: { key: string }): Promise<ToolResult> {
  if (!browserView) {
    return { success: false, error: "BrowserView not initialized" }
  }

  const { key } = params

  if (!key || typeof key !== "string") {
    return { success: false, error: "Keypress requires key parameter" }
  }

  const debugger_ = browserView.webContents.debugger

  try {
    debugger_.attach("1.3")
  } catch (err) {
    if (!(err instanceof Error && err.message.includes("Already attached"))) {
      throw err
    }
  }

  try {
    // Handle SelectAll (Ctrl+A on Windows/Linux, Cmd+A on macOS)
    if (key === "SelectAll") {
      const isMac = process.platform === "darwin"
      // CDP modifiers: 1=Alt, 2=Ctrl, 4=Meta(Cmd), 8=Shift
      const modifier = isMac ? 4 : 2
      const modKey = isMac ? "Meta" : "Control"
      const modCode = isMac ? "MetaLeft" : "ControlLeft"
      const modKeyCode = isMac ? 91 : 17

      await debugger_.sendCommand("Input.dispatchKeyEvent", {
        type: "keyDown",
        key: modKey,
        code: modCode,
        windowsVirtualKeyCode: modKeyCode,
        nativeVirtualKeyCode: modKeyCode,
        modifiers: modifier,
      })
      await debugger_.sendCommand("Input.dispatchKeyEvent", {
        type: "keyDown",
        key: "a",
        code: "KeyA",
        windowsVirtualKeyCode: 65,
        nativeVirtualKeyCode: 65,
        modifiers: modifier,
      })
      await debugger_.sendCommand("Input.dispatchKeyEvent", {
        type: "keyUp",
        key: "a",
        code: "KeyA",
        windowsVirtualKeyCode: 65,
        nativeVirtualKeyCode: 65,
        modifiers: modifier,
      })
      await debugger_.sendCommand("Input.dispatchKeyEvent", {
        type: "keyUp",
        key: modKey,
        code: modCode,
        windowsVirtualKeyCode: modKeyCode,
        nativeVirtualKeyCode: modKeyCode,
        modifiers: 0,
      })
      logger.info(`[ToolExecutor] Pressed SelectAll (${modKey}+A)`)
      return { success: true }
    }

    // Key mappings
    const keyMap: Record<string, { key: string; code: string; keyCode: number }> = {
      Tab: { key: "Tab", code: "Tab", keyCode: 9 },
      Enter: { key: "Enter", code: "Enter", keyCode: 13 },
      Escape: { key: "Escape", code: "Escape", keyCode: 27 },
      Backspace: { key: "Backspace", code: "Backspace", keyCode: 8 },
      ArrowDown: { key: "ArrowDown", code: "ArrowDown", keyCode: 40 },
      ArrowUp: { key: "ArrowUp", code: "ArrowUp", keyCode: 38 },
      ArrowLeft: { key: "ArrowLeft", code: "ArrowLeft", keyCode: 37 },
      ArrowRight: { key: "ArrowRight", code: "ArrowRight", keyCode: 39 },
      Space: { key: " ", code: "Space", keyCode: 32 },
    }

    const keyInfo = keyMap[key]
    if (!keyInfo) {
      const validKeys = Object.keys(keyMap).join(", ")
      return { success: false, error: `Unknown key: ${key}. Valid keys: ${validKeys}, SelectAll` }
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

    logger.info(`[ToolExecutor] Pressed ${key}`)
    return { success: true }
  } finally {
    try {
      debugger_.detach()
    } catch {
      /* ignore */
    }
  }
}

/**
 * Generate a document (resume or cover letter)
 */
async function handleGenerateDocument(
  type: "resume" | "coverLetter",
  params: { jobMatchId?: string }
): Promise<ToolResult> {
  // Use provided jobMatchId or fall back to current context
  const jobMatchId = params.jobMatchId || currentJobMatchId

  if (!jobMatchId) {
    return { success: false, error: "No job context available. Please select a job first." }
  }

  logger.info(`[ToolExecutor] Starting ${type} generation for job ${jobMatchId}`)

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
      logger.info(`[ToolExecutor] Generation step ${stepCount}: ${nextStep}`)

      const stepResult = await executeGenerationStep(requestId)

      if (stepResult.status === "failed") {
        return { success: false, error: stepResult.error || "Generation failed" }
      }

      nextStep = stepResult.nextStep

      if (stepResult.status === "completed") {
        const url = type === "coverLetter" ? stepResult.coverLetterUrl : stepResult.resumeUrl
        logger.info(`[ToolExecutor] Generation completed: ${url}`)
        // Store the documentId for subsequent upload_file calls
        lastGeneratedDocumentId = requestId
        return {
          success: true,
          data: {
            url,
            documentId: requestId,
            type,
            message: `${type === "coverLetter" ? "Cover letter" : "Resume"} generated. Use upload_file with type="${type}" to upload it.`,
          },
        }
      }
    }

    if (stepCount >= maxSteps) {
      return { success: false, error: "Generation exceeded maximum steps" }
    }

    return { success: false, error: "Generation did not complete" }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}

/**
 * Upload a file to a file input on the page
 */
async function handleUploadFile(params: {
  type: "resume" | "coverLetter"
  documentId?: string
}): Promise<ToolResult> {
  if (!browserView) {
    return { success: false, error: "BrowserView not initialized" }
  }

  const { type } = params
  // Use provided documentId or fall back to last generated document
  const documentId = params.documentId || lastGeneratedDocumentId

  if (!documentId) {
    return {
      success: false,
      error: "No document available. Generate a resume or cover letter first.",
    }
  }

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

  try {
    // Fetch document details
    const doc = await fetchGeneratorRequest(documentId)

    const docUrl = type === "coverLetter" ? doc.coverLetterUrl : doc.resumeUrl
    if (!docUrl) {
      return { success: false, error: `No ${type} file found for document ${documentId}` }
    }

    // Resolve file path
    const config = getConfig()
    const filePath = resolveDocumentPath(docUrl, config.ARTIFACTS_DIR)

    if (!fs.existsSync(filePath)) {
      return { success: false, error: `File not found: ${filePath}` }
    }

    // Use CDP to set files on input
    const debugger_ = browserView.webContents.debugger

    try {
      debugger_.attach("1.3")
    } catch (err) {
      if (!(err instanceof Error && err.message.includes("Already attached"))) {
        throw err
      }
    }

    try {
      const { root } = await debugger_.sendCommand("DOM.getDocument", {})
      const { nodeId } = await debugger_.sendCommand("DOM.querySelector", {
        nodeId: root.nodeId,
        selector: fileInputSelector,
      })

      if (!nodeId) {
        return { success: false, error: "File input node not found in DOM" }
      }

      await debugger_.sendCommand("DOM.setFileInputFiles", {
        nodeId,
        files: [filePath],
      })

      logger.info(`[ToolExecutor] Uploaded ${type} from ${filePath}`)
      return { success: true, data: { filePath, type } }
    } finally {
      try {
        debugger_.detach()
      } catch {
        /* ignore */
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}

/**
 * Handle done signal - form filling complete
 */
function handleDone(params: { summary?: string }): ToolResult {
  const summary = params.summary || "Form filling completed"
  logger.info(`[ToolExecutor] Done: ${summary}`)

  // Notify main process to stop the CLI (deferred to allow response to be sent)
  if (completionCallback) {
    setTimeout(() => completionCallback?.(summary), 100)
  }

  return {
    success: true,
    data: { summary, completed: true },
  }
}
