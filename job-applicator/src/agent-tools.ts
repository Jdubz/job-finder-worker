/**
 * Agent Tool Handlers
 *
 * Implements the tools available to the form-filling agent.
 * Each tool handler executes an action and returns a result.
 */

import type { BrowserView } from "electron"
import * as crypto from "crypto"
import * as fs from "fs"
import { logger } from "./logger.js"
import type { ToolCall, ToolResult } from "./agent-session.js"
import {
  startGeneration,
  executeGenerationStep,
  fetchGeneratorRequest,
} from "./api-client.js"
import { resolveDocumentPath, getConfig, withTimeout } from "./utils.js"

// ============================================================================
// Configuration
// ============================================================================

const SCREENSHOT_WIDTH = 1280
const TOOL_TIMEOUT_MS = 30000 // 30 second timeout for tool execution

// ============================================================================
// BrowserView Reference
// ============================================================================

let browserView: BrowserView | null = null

/**
 * Set the BrowserView reference for tool handlers
 */
export function setBrowserView(view: BrowserView | null): void {
  browserView = view
  logger.info(`[AgentTools] BrowserView ${view ? "set" : "cleared"}`)
}

/**
 * Get the current BrowserView reference
 */
export function getBrowserView(): BrowserView | null {
  return browserView
}

// ============================================================================
// Agent Context (set by main.ts when fill command is issued)
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
  logger.info(`[AgentTools] Current job match ID: ${id || "(none)"}`)
}

/**
 * Get the current job match ID
 */
export function getCurrentJobMatchId(): string | null {
  return currentJobMatchId
}

/**
 * Clear agent context (call when session stops)
 */
export function clearAgentContext(): void {
  currentJobMatchId = null
  lastGeneratedDocumentId = null
  logger.info("[AgentTools] Agent context cleared")
}

// ============================================================================
// Main Tool Executor
// ============================================================================

/**
 * Execute a tool call and return the result (with timeout)
 */
export async function executeTool(tool: ToolCall): Promise<ToolResult> {
  const { name, params = {} } = tool

  logger.info(`[AgentTools] Executing tool: ${name}`)

  try {
    // Wrap tool execution with timeout (except for long-running operations)
    const isLongRunning = name === "generate_resume" || name === "generate_cover_letter"
    const timeoutMs = isLongRunning ? 120000 : TOOL_TIMEOUT_MS // 2 min for generation, 30s for others

    const result = await withTimeout(
      executeToolInternal(name, params),
      timeoutMs,
      `Tool '${name}' timed out after ${timeoutMs / 1000}s`
    )
    return result
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error(`[AgentTools] Tool ${name} failed: ${message}`)
    return { success: false, error: message }
  }
}

/**
 * Internal tool executor (without timeout wrapper)
 */
async function executeToolInternal(name: string, params: Record<string, unknown>): Promise<ToolResult> {
  switch (name) {
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
      logger.warn(`[AgentTools] Unknown tool: ${name}`)
      return { success: false, error: `Unknown tool: ${name}` }
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
  logger.info(`[AgentTools] Screenshot captured: ${finalSize.width}x${finalSize.height}, hash=${hash}`)

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

  logger.info(`[AgentTools] Found ${fields.length} form fields`)

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

  logger.info(`[AgentTools] Page info: ${title} (${url})`)

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

    logger.info(`[AgentTools] Clicked at (${x}, ${y}) -> scaled (${scaledX}, ${scaledY})`)
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
    logger.info(`[AgentTools] Typed ${text.length} characters`)
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
  logger.info(`[AgentTools] Scrolled by (${dx}, ${dy})`)

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
    // Handle SelectAll (Ctrl+A)
    if (key === "SelectAll") {
      await debugger_.sendCommand("Input.dispatchKeyEvent", {
        type: "keyDown",
        key: "Control",
        code: "ControlLeft",
        windowsVirtualKeyCode: 17,
        nativeVirtualKeyCode: 17,
        modifiers: 2,
      })
      await debugger_.sendCommand("Input.dispatchKeyEvent", {
        type: "keyDown",
        key: "a",
        code: "KeyA",
        windowsVirtualKeyCode: 65,
        nativeVirtualKeyCode: 65,
        modifiers: 2,
      })
      await debugger_.sendCommand("Input.dispatchKeyEvent", {
        type: "keyUp",
        key: "a",
        code: "KeyA",
        windowsVirtualKeyCode: 65,
        nativeVirtualKeyCode: 65,
        modifiers: 2,
      })
      await debugger_.sendCommand("Input.dispatchKeyEvent", {
        type: "keyUp",
        key: "Control",
        code: "ControlLeft",
        windowsVirtualKeyCode: 17,
        nativeVirtualKeyCode: 17,
        modifiers: 0,
      })
      logger.info("[AgentTools] Pressed SelectAll (Ctrl+A)")
      return { success: true }
    }

    // Handle other keys
    const keyMap: Record<string, { key: string; code: string; keyCode: number }> = {
      Tab: { key: "Tab", code: "Tab", keyCode: 9 },
      Enter: { key: "Enter", code: "Enter", keyCode: 13 },
      Escape: { key: "Escape", code: "Escape", keyCode: 27 },
      Backspace: { key: "Backspace", code: "Backspace", keyCode: 8 },
    }

    const keyInfo = keyMap[key]
    if (!keyInfo) {
      return { success: false, error: `Unknown key: ${key}. Valid keys: Tab, Enter, Escape, Backspace, SelectAll` }
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

    logger.info(`[AgentTools] Pressed ${key}`)
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
    return { success: false, error: "No job context available. Please select a job first or provide jobMatchId." }
  }

  logger.info(`[AgentTools] Starting ${type} generation for job ${jobMatchId}`)

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
      logger.info(`[AgentTools] Generation step ${stepCount}: ${nextStep}`)

      const stepResult = await executeGenerationStep(requestId)

      if (stepResult.status === "failed") {
        return { success: false, error: stepResult.error || "Generation failed" }
      }

      nextStep = stepResult.nextStep

      if (stepResult.status === "completed") {
        const url = type === "coverLetter" ? stepResult.coverLetterUrl : stepResult.resumeUrl
        logger.info(`[AgentTools] Generation completed: ${url}`)
        // Store the documentId for subsequent upload_file calls
        lastGeneratedDocumentId = requestId
        return {
          success: true,
          data: {
            url,
            documentId: requestId,
            type,
            message: `${type === "coverLetter" ? "Cover letter" : "Resume"} generated. Use upload_file with type="${type}" to upload it.`
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
async function handleUploadFile(params: { type: "resume" | "coverLetter"; documentId?: string }): Promise<ToolResult> {
  if (!browserView) {
    return { success: false, error: "BrowserView not initialized" }
  }

  const { type } = params
  // Use provided documentId or fall back to last generated document
  const documentId = params.documentId || lastGeneratedDocumentId

  if (!documentId) {
    return { success: false, error: "No document available. Generate a resume or cover letter first, or provide documentId." }
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

      logger.info(`[AgentTools] Uploaded ${type} from ${filePath}`)
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
  logger.info(`[AgentTools] Done: ${summary}`)

  return {
    success: true,
    data: { summary, completed: true },
  }
}
