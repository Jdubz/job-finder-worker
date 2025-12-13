/**
 * Tool Executor
 *
 * Implements the browser automation tools for the MCP server.
 * Each tool handler executes an action and returns a result.
 */

import type { BrowserView } from "electron"
import * as crypto from "crypto"
import { logger } from "./logger.js"

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

const SCREENSHOT_MAX_WIDTH = 1280 // Max width for screenshots sent to agent
const TOOL_TIMEOUT_MS = 30000 // 30 second timeout for tool execution
const COMBOBOX_DROPDOWN_DELAY_MS = 500 // Wait for dropdown to appear after typing (increased for large datasets)

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
let userProfile: unknown = null
let jobContext: unknown = null
let documentUrls: { resumeUrl?: string; coverLetterUrl?: string } = {}

/** Callback type for uploading documents to file inputs */
type UploadCallback = (
  selector: string,
  type: "resume" | "coverLetter",
  documentUrl: string
) => Promise<{ success: boolean; message: string }>

let uploadCallback: UploadCallback | null = null

/**
 * Set the current job match ID for form filling context
 */
export function setCurrentJobMatchId(id: string | null): void {
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
  userProfile = null
  jobContext = null
  documentUrls = {}
  uploadCallback = null
  logger.info("[ToolExecutor] Job context cleared")
}

/**
 * Set the document URLs for the upload_file tool
 */
export function setDocumentUrls(urls: { resumeUrl?: string; coverLetterUrl?: string }): void {
  documentUrls = urls
  logger.info(`[ToolExecutor] Document URLs set: resume=${!!urls.resumeUrl}, coverLetter=${!!urls.coverLetterUrl}`)
}

/**
 * Set the upload callback for the upload_file tool
 * This callback is provided by main.ts and handles the actual file upload
 */
export function setUploadCallback(callback: UploadCallback | null): void {
  uploadCallback = callback
  logger.info(`[ToolExecutor] Upload callback ${callback ? "set" : "cleared"}`)
}

/**
 * Set the user profile data for the get_user_profile tool
 */
export function setUserProfile(profile: unknown): void {
  userProfile = profile
  logger.info("[ToolExecutor] User profile set")
}

/**
 * Set the job context data for the get_job_context tool
 */
export function setJobContext(context: unknown): void {
  jobContext = context
  logger.info("[ToolExecutor] Job context set")
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
  const timeoutMs = TOOL_TIMEOUT_MS

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
    // Internal/health-only tool - not exposed to agent prompts
    case "__healthcheck__":
      return { success: true, data: { browserReady: !!browserView } }

    case "screenshot":
      return await handleScreenshot()

    case "get_form_fields":
      return await handleGetFormFields()

    case "fill_field":
      return await handleFillField(params as { selector: string; value: string })

    case "select_option":
      return await handleSelectOption(params as { selector: string; value: string })

    case "select_combobox":
      return await handleSelectCombobox(params as { selector: string; value: string })

    case "peek_dropdown":
      return await handlePeekDropdown(params as { selector: string })

    case "set_checkbox":
      return await handleSetCheckbox(params as { selector: string; checked: boolean })

    case "click_element":
      return await handleClickElement(params as { selector: string })

    case "get_buttons":
      return await handleGetButtons()

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

    case "done":
      return handleDone(params as { summary?: string })

    case "get_user_profile":
      return handleGetUserProfile()

    case "get_job_context":
      return handleGetJobContext()

    case "upload_file":
      return await handleUploadFile(params as { selector: string; type: "resume" | "coverLetter" })

    case "find_upload_areas":
      return await handleFindUploadAreas()

    default:
      logger.warn(`[ToolExecutor] Unknown tool: ${tool}`)
      return { success: false, error: `Unknown tool: ${tool}` }
  }
}

// ============================================================================
// Tool Handlers
// ============================================================================

// Track screenshot scale for coordinate mapping
let screenshotScale = 1

/**
 * Capture a screenshot of the current page
 */
async function handleScreenshot(): Promise<ToolResult> {
  if (!browserView) {
    return { success: false, error: "BrowserView not initialized" }
  }

  const nativeImage = await browserView.webContents.capturePage()
  const size = nativeImage.getSize()

  // Resize if wider than max, maintaining aspect ratio
  let finalImage = nativeImage
  let finalWidth = size.width
  let finalHeight = size.height

  if (size.width > SCREENSHOT_MAX_WIDTH) {
    screenshotScale = size.width / SCREENSHOT_MAX_WIDTH
    finalWidth = SCREENSHOT_MAX_WIDTH
    finalHeight = Math.round(size.height / screenshotScale)
    finalImage = nativeImage.resize({ width: finalWidth, height: finalHeight, quality: "good" })
  } else {
    screenshotScale = 1
  }

  const jpeg = finalImage.toJPEG(60)
  if (!jpeg || jpeg.length === 0) {
    logger.error("[ToolExecutor] Screenshot capture returned empty buffer")
    return { success: false, error: "Failed to capture screenshot (empty image)" }
  }
  const base64 = jpeg.toString("base64")
  const hash = crypto.createHash("sha1").update(jpeg).digest("hex").slice(0, 8)

  logger.info(`[ToolExecutor] Screenshot: ${finalWidth}x${finalHeight} (scale=${screenshotScale.toFixed(2)}), hash=${hash}`)

  return {
    success: true,
    data: {
      image: `data:image/jpeg;base64,${base64}`,
      width: finalWidth,
      height: finalHeight,
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
      // Helper: Build a unique CSS selector path for an element
      function buildSelectorPath(el) {
        // First try ID
        if (el.id) {
          return '#' + CSS.escape(el.id);
        }

        // Try name attribute (common for form fields)
        if (el.name) {
          const tag = el.tagName.toLowerCase();
          const nameSelector = tag + '[name="' + CSS.escape(el.name) + '"]';
          // Check if this selector is unique
          if (document.querySelectorAll(nameSelector).length === 1) {
            return nameSelector;
          }
        }

        // Build path from nearest ancestor with ID
        const path = [];
        let current = el;
        while (current && current !== document.body) {
          let segment = current.tagName.toLowerCase();

          if (current.id) {
            // Found an ancestor with ID - start path from here
            path.unshift('#' + CSS.escape(current.id));
            break;
          }

          // Add index among siblings of same type
          const parent = current.parentElement;
          if (parent) {
            const siblings = Array.from(parent.children).filter(c => c.tagName === current.tagName);
            if (siblings.length > 1) {
              const index = siblings.indexOf(current) + 1;
              segment += ':nth-of-type(' + index + ')';
            }
          }

          path.unshift(segment);
          current = current.parentElement;
        }

        // If no ancestor with ID found, start from body
        if (path.length > 0 && !path[0].startsWith('#')) {
          path.unshift('body');
        }

        return path.join(' > ');
      }

      const inputs = document.querySelectorAll('input, select, textarea');
      return Array.from(inputs).map((el, idx) => {
        const rect = el.getBoundingClientRect();
        const fieldType = el.type || el.tagName.toLowerCase();

        // Skip hidden type fields (but NOT visually hidden file inputs)
        if (fieldType === 'hidden') return null;

        // For file inputs, include even if visually hidden (they're often triggered by buttons)
        const isFileInput = fieldType === 'file';
        if (!isFileInput && (rect.width === 0 || rect.height === 0)) return null;
        if (el.disabled) return null;

        // Build a reliable CSS selector
        const selector = buildSelectorPath(el);

        // Get label text from multiple sources (skip label[for] query if no id)
        let labelEl = null;
        if (el.id) {
          labelEl = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
        }
        const ariaLabel = el.getAttribute('aria-label');
        const placeholder = el.getAttribute('placeholder');
        const closestLabel = el.closest('label')?.textContent?.trim();
        // Also check for preceding label sibling or parent text
        const prevSibling = el.previousElementSibling;
        const prevLabel = prevSibling?.tagName === 'LABEL' ? prevSibling.textContent?.trim() : null;
        const label = labelEl?.textContent?.trim() || ariaLabel || placeholder || closestLabel || prevLabel || el.name || 'field_' + idx;

        // Get options for select elements
        let options = null;
        if (el.tagName === 'SELECT') {
          options = Array.from(el.options).map(opt => ({
            value: opt.value,
            text: opt.textContent?.trim() || '',
            selected: opt.selected
          }));
        }

        return {
          index: idx,
          selector: selector,
          type: fieldType,
          name: el.name || null,
          id: el.id || null,
          label: label,
          value: el.value || '',
          options: options,
          x: Math.round(rect.left + rect.width / 2),
          y: Math.round(rect.top + rect.height / 2),
          required: el.required || false,
          checked: (fieldType === 'checkbox' || fieldType === 'radio') ? el.checked : null,
        };
      }).filter(f => f !== null);
    })()
  `)

  // Log summary including dropdowns for debugging
  const dropdowns = fields.filter((f: { type: string; options?: unknown[] }) => f.type === "select-one" || f.type === "select-multiple")
  logger.info(`[ToolExecutor] Found ${fields.length} form fields (${dropdowns.length} dropdowns)`)
  if (dropdowns.length > 0) {
    for (const dd of dropdowns) {
      const optCount = (dd as { options?: unknown[] }).options?.length || 0
      logger.info(`[ToolExecutor]   Dropdown: ${(dd as { label: string }).label} (${optCount} options)`)
    }
  }

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
 * Fill a form field by CSS selector
 * Uses native value setter to work with React/Vue/Angular controlled inputs
 */
async function handleFillField(params: { selector: string; value: string }): Promise<ToolResult> {
  if (!browserView) {
    return { success: false, error: "BrowserView not initialized" }
  }

  const { selector, value } = params

  if (!selector || typeof value !== "string") {
    return { success: false, error: "fill_field requires selector and value" }
  }

  try {
    const selectorJson = JSON.stringify(selector)
    const valueJson = JSON.stringify(value)

    // Strategy 1: Enhanced DOM-based filling with InputEvent
    const result = await browserView.webContents.executeJavaScript(`
      (() => {
        const selector = ${selectorJson};
        const value = ${valueJson};
        const el = document.querySelector(selector);
        if (!el) return { success: false, error: 'Element not found: ' + selector };
        if (el.disabled) return { success: false, error: 'Element is disabled: ' + selector };
        if (el.readOnly) return { success: false, error: 'Element is read-only: ' + selector, needsKeyboard: true };

        // Determine element type for proper native setter
        const isInput = el instanceof HTMLInputElement;
        const isTextarea = el instanceof HTMLTextAreaElement;

        if (!isInput && !isTextarea) {
          // For contenteditable or other elements, try direct approach
          el.focus();
          el.textContent = value;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          const finalValue = el.textContent;
          if (finalValue !== value) {
            return { success: false, error: 'contenteditable did not accept value', needsKeyboard: true };
          }
          return { success: true, selector: selector, value: finalValue, method: 'contenteditable' };
        }

        // Get the native value setter - this bypasses React/Vue/Angular's override
        const prototype = isInput ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
        const nativeSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

        // Scroll into view and focus
        el.scrollIntoView({ behavior: 'instant', block: 'center' });
        el.focus();

        // Clear existing value first (important for some forms)
        if (nativeSetter) {
          nativeSetter.call(el, '');
        } else {
          el.value = '';
        }

        // Dispatch events to signal the clear
        el.dispatchEvent(new Event('input', { bubbles: true }));

        // Small delay simulation (some forms check for this)
        // Set the new value
        if (nativeSetter) {
          nativeSetter.call(el, value);
        } else {
          el.value = value;
        }

        // Dispatch comprehensive events for maximum compatibility
        // 1. InputEvent with inputType (React 17+, modern frameworks)
        try {
          el.dispatchEvent(new InputEvent('input', {
            bubbles: true,
            cancelable: true,
            inputType: 'insertText',
            data: value
          }));
        } catch (e) {
          // Fallback for older browsers
          el.dispatchEvent(new Event('input', { bubbles: true }));
        }

        // 2. Change event (form validation, native behavior)
        el.dispatchEvent(new Event('change', { bubbles: true }));

        // 3. Blur then refocus (triggers validation on some forms)
        el.blur();
        el.focus();

        // Verify the value stuck
        const finalValue = el.value;
        if (finalValue !== value) {
          // Value didn't stick - might need keyboard-based input
          return {
            success: false,
            error: 'Value rejected by form',
            attempted: value,
            actual: finalValue,
            needsKeyboard: true
          };
        }

        return { success: true, selector: selector, value: finalValue, method: 'native-setter' };
      })()
    `)

    // If DOM approach worked, we're done
    if (result.success) {
      logger.info(`[ToolExecutor] Filled ${selector} via ${result.method}`)
      return result
    }

    // Strategy 2: If DOM approach failed and keyboard input might help, try it
    if (result.needsKeyboard) {
      logger.info(`[ToolExecutor] DOM fill failed, trying keyboard input for ${selector}`)

      // First click to focus the element
      const clickResult = await handleClickElement({ selector })
      if (!clickResult.success) {
        return { success: false, error: `Could not focus field: ${clickResult.error}` }
      }

      // Clear existing content with select-all + delete
      await handleKeypress({ key: "SelectAll" })
      await new Promise(resolve => setTimeout(resolve, 50))
      await handleKeypress({ key: "Backspace" })
      await new Promise(resolve => setTimeout(resolve, 50))

      // Type the value character by character using debugger protocol
      const typeResult = await handleType({ text: value })
      if (!typeResult.success) {
        return { success: false, error: `Keyboard input failed: ${typeResult.error}` }
      }

      // Verify the value
      const verifyResult = await browserView.webContents.executeJavaScript(`
        (() => {
          const el = document.querySelector(${selectorJson});
          if (!el) return { success: false, error: 'Element not found after typing' };
          const finalValue = el.value || el.textContent || '';
          return { success: true, value: finalValue };
        })()
      `)

      if (verifyResult.success && verifyResult.value === value) {
        logger.info(`[ToolExecutor] Filled ${selector} via keyboard input`)
        return { success: true, data: { selector, value, method: 'keyboard' } }
      }

      // Even if verification failed, the value might be there (some forms mask values)
      logger.info(`[ToolExecutor] Filled ${selector} via keyboard (value may be masked)`)
      return { success: true, data: { selector, value, method: 'keyboard-unverified' } }
    }

    logger.warn(`[ToolExecutor] fill_field failed: ${result.error}`)
    return result
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}

/**
 * Select an option in a dropdown by CSS selector
 * Uses native value setter for React/Vue/Angular compatibility
 */
async function handleSelectOption(params: { selector: string; value: string }): Promise<ToolResult> {
  if (!browserView) {
    return { success: false, error: "BrowserView not initialized" }
  }

  const { selector, value } = params

  if (!selector || typeof value !== "string") {
    return { success: false, error: "select_option requires selector and value" }
  }

  logger.info(`[ToolExecutor] select_option: trying to select "${value}" in ${selector}`)

  try {
    const selectorJson = JSON.stringify(selector)
    const valueJson = JSON.stringify(value)
    const result = await browserView.webContents.executeJavaScript(`
      (() => {
        const selector = ${selectorJson};
        const targetValue = ${valueJson};
        const el = document.querySelector(selector);
        if (!el) return { success: false, error: 'Element not found: ' + selector };
        if (el.tagName !== 'SELECT') return { success: false, error: 'Element is not a select: ' + el.tagName };
        if (el.disabled) return { success: false, error: 'Element is disabled: ' + selector };

        // Focus the element first
        el.focus();

        // Try to find option by value first, then by exact text, then partial match
        let option = Array.from(el.options).find(opt => opt.value === targetValue);
        if (!option) {
          option = Array.from(el.options).find(opt =>
            opt.textContent?.trim().toLowerCase() === targetValue.toLowerCase()
          );
        }
        if (!option) {
          // Try partial match
          option = Array.from(el.options).find(opt =>
            opt.textContent?.trim().toLowerCase().includes(targetValue.toLowerCase())
          );
        }

        if (!option) {
          const availableOptions = Array.from(el.options).map(o => o.value || o.textContent?.trim()).join(', ');
          return { success: false, error: 'Option not found: ' + targetValue + '. Available: ' + availableOptions };
        }

        // Use native value setter for React compatibility
        const nativeSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
        if (nativeSetter) {
          nativeSetter.call(el, option.value);
        } else {
          el.value = option.value;
        }

        // Dispatch both input and change events
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));

        // Verify selection
        if (el.value !== option.value) {
          return { success: false, error: 'Selection did not persist', attempted: option.value, actual: el.value };
        }

        return { success: true, selector: selector, selectedValue: option.value, selectedText: option.textContent?.trim() };
      })()
    `)

    if (result.success) {
      logger.info(`[ToolExecutor] Selected "${result.selectedText}" in ${selector}`)
    } else {
      logger.warn(`[ToolExecutor] select_option failed: ${result.error}`)
    }

    return result
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}

/** Common dropdown option selectors used by UI libraries */
const DROPDOWN_OPTION_SELECTORS = [
  // ARIA-compliant dropdowns (most reliable)
  '[role="listbox"] [role="option"]',
  '[role="listbox"] li',
  '[role="menu"] [role="menuitem"]',
  '[role="menu"] li',
  // Common class patterns
  '.dropdown-menu li',
  '.dropdown-menu a',
  '.autocomplete-results li',
  '.autocomplete-results div',
  '.select-dropdown li',
  '.suggestions li',
  '.suggestions div',
  '[class*="dropdown"] li',
  '[class*="dropdown"] [class*="option"]',
  '[class*="menu"] [class*="item"]',
  '[class*="listbox"] [class*="option"]',
  'ul[class*="select"] li',
  'div[class*="select"] div[class*="option"]',
  // Material UI
  '[class*="MuiAutocomplete"] [role="option"]',
  '[class*="MuiMenu"] [role="menuitem"]',
  // React Select
  '[class*="react-select"] [class*="option"]',
  // Custom design systems (Dropbox dig-, Atlassian, etc.)
  '[class*="dig-"] [class*="option"]',
  '[class*="dig-"] [class*="item"]',
  '[class*="Dropdown"] [class*="Item"]',
  '[class*="Combobox"] [class*="Option"]',
  '[class*="Typeahead"] [class*="Option"]',
  '[class*="picker"] [class*="option"]',
  '[class*="suggestions"] [class*="item"]',
  // Data attributes
  '[data-option]',
  '[data-value]',
  '[data-testid*="option"]',
  // Popover/portal-based dropdowns (rendered at root)
  '[id*="popover"] [role="option"]',
  '[id*="portal"] [role="option"]',
  '[id*="dropdown"] li',
]

/**
 * Peek at dropdown options without selecting
 * Opens the dropdown and returns available options for the agent to choose from
 */
async function handlePeekDropdown(params: { selector: string }): Promise<ToolResult> {
  if (!browserView) {
    return { success: false, error: "BrowserView not initialized" }
  }

  const { selector } = params
  if (!selector) {
    return { success: false, error: "peek_dropdown requires selector" }
  }

  logger.info(`[ToolExecutor] peek_dropdown: opening ${selector}`)

  try {
    const selectorJson = JSON.stringify(selector)
    const selectorsJson = JSON.stringify(DROPDOWN_OPTION_SELECTORS)

    // Step 1: Focus/click to open dropdown
    await browserView.webContents.executeJavaScript(`
      (() => {
        const el = document.querySelector(${selectorJson});
        if (!el) return { success: false, error: 'Element not found' };
        el.focus();
        el.click();
        el.dispatchEvent(new Event('focus', { bubbles: true }));
        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        return { success: true };
      })()
    `)

    // Wait for dropdown to appear
    await new Promise(resolve => setTimeout(resolve, COMBOBOX_DROPDOWN_DELAY_MS))

    // Step 2: Collect all visible options
    const result = await browserView.webContents.executeJavaScript(`
      (() => {
        const dropdownSelectors = ${selectorsJson};
        const options = [];
        const seen = new Set();

        for (const sel of dropdownSelectors) {
          const els = document.querySelectorAll(sel);
          for (const opt of els) {
            const rect = opt.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) continue;
            const style = window.getComputedStyle(opt);
            if (style.display === 'none' || style.visibility === 'hidden') continue;

            const text = opt.textContent?.trim() || '';
            if (!text || seen.has(text)) continue;
            seen.add(text);

            options.push({
              text: text,
              value: opt.getAttribute('data-value') || text,
            });
          }
        }

        return { success: true, options: options.slice(0, 30) };
      })()
    `)

    logger.info(`[ToolExecutor] peek_dropdown found ${result.options?.length || 0} options`)
    return {
      success: true,
      data: {
        options: result.options || [],
        hint: result.options?.length === 0
          ? "No dropdown options visible. Try typing a few characters first with select_combobox."
          : "Choose the best matching option and use select_combobox with the EXACT text."
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}

/**
 * Select from a searchable dropdown (combobox/autocomplete)
 *
 * IMPROVED ALGORITHM:
 * 1. First, try to open dropdown without typing and look for a match
 * 2. If no match, type incrementally (first few chars) to filter options
 * 3. Select the BEST available match, even if not exact
 * 4. For confirmation fields, match semantic intent (e.g., "yes" -> "I confirm...")
 */
async function handleSelectCombobox(params: { selector: string; value: string }): Promise<ToolResult> {
  if (!browserView) {
    return { success: false, error: "BrowserView not initialized" }
  }

  const { selector, value } = params

  if (!selector || typeof value !== "string") {
    return { success: false, error: "select_combobox requires selector and value" }
  }

  logger.info(`[ToolExecutor] select_combobox: selecting "${value}" in ${selector}`)

  try {
    const selectorJson = JSON.stringify(selector)
    const selectorsJson = JSON.stringify(DROPDOWN_OPTION_SELECTORS)

    // Helper function to find and click the best matching option
    const findAndSelectOption = async (searchValue: string): Promise<ToolResult> => {
      const searchJson = JSON.stringify(searchValue.toLowerCase())

      const selectResult = await browserView!.webContents.executeJavaScript(`
        (() => {
          const targetValue = ${searchJson};
          const dropdownSelectors = ${selectorsJson};

          // Scoring function for matching options
          function scoreMatch(text, target) {
            const lowerText = text.toLowerCase();
            if (lowerText === target) return 100; // Exact match
            if (lowerText.startsWith(target)) return 80; // Starts with
            if (target.startsWith(lowerText)) return 70; // Target starts with option (for short options)
            if (lowerText.includes(target)) return 60; // Contains
            if (target.includes(lowerText)) return 50; // Option contained in target

            // Handle confirmation/consent fields: "yes" should match "I confirm and consent..."
            const confirmPatterns = ['yes', 'agree', 'confirm', 'accept', 'consent'];
            const isConfirmTarget = confirmPatterns.some(p => target.includes(p));
            const isConfirmOption = confirmPatterns.some(p => lowerText.includes(p));
            if (isConfirmTarget && isConfirmOption) return 75;

            // Fuzzy: check if most words match
            const targetWords = target.split(/\\s+/).filter(w => w.length > 2);
            const textWords = lowerText.split(/\\s+/).filter(w => w.length > 2);
            const matchingWords = targetWords.filter(tw => textWords.some(ow => ow.includes(tw) || tw.includes(ow)));
            if (matchingWords.length > 0 && matchingWords.length >= targetWords.length * 0.5) {
              return 40 + (matchingWords.length / targetWords.length) * 20;
            }

            return 0;
          }

          let bestMatch = null;
          let bestScore = 0;
          let allOptions = [];

          for (const dropdownSelector of dropdownSelectors) {
            const options = document.querySelectorAll(dropdownSelector);
            if (options.length === 0) continue;

            for (const opt of options) {
              const rect = opt.getBoundingClientRect();
              if (rect.width === 0 || rect.height === 0) continue;
              const style = window.getComputedStyle(opt);
              if (style.display === 'none' || style.visibility === 'hidden') continue;

              const text = opt.textContent?.trim() || '';
              const dataValue = opt.getAttribute('data-value') || '';
              if (!text && !dataValue) continue;

              allOptions.push(text || dataValue);

              const textScore = scoreMatch(text, targetValue);
              const dataScore = scoreMatch(dataValue, targetValue);
              const score = Math.max(textScore, dataScore);

              if (score > bestScore) {
                bestScore = score;
                bestMatch = opt;
              }
            }
          }

          // Accept any match with score >= 40 (reasonable match)
          if (!bestMatch || bestScore < 40) {
            return {
              success: false,
              error: 'No suitable match found (best score: ' + bestScore + ')',
              searchedFor: targetValue,
              availableOptions: allOptions.slice(0, 15)
            };
          }

          // Click the option
          bestMatch.scrollIntoView({ block: 'nearest' });
          bestMatch.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
          bestMatch.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
          bestMatch.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

          return {
            success: true,
            selectedText: bestMatch.textContent?.trim(),
            selectedValue: bestMatch.getAttribute('data-value') || bestMatch.textContent?.trim(),
            matchScore: bestScore
          };
        })()
      `)

      return selectResult
    }

    // Step 1: Open dropdown by focusing/clicking without typing
    await browserView.webContents.executeJavaScript(`
      (() => {
        const el = document.querySelector(${selectorJson});
        if (!el) return { success: false };
        el.focus();
        el.click();
        el.dispatchEvent(new Event('focus', { bubbles: true }));
        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        return { success: true };
      })()
    `)

    await new Promise(resolve => setTimeout(resolve, COMBOBOX_DROPDOWN_DELAY_MS))

    // Step 2: Try to find a match in the open dropdown
    let result = await findAndSelectOption(value) as ToolResult & { selectedText?: string; matchScore?: number; availableOptions?: string[] }

    if (result.success) {
      logger.info(`[ToolExecutor] Combobox selected (no typing): "${result.selectedText}" (score: ${result.matchScore})`)
      return result
    }

    // Step 3: Type incrementally to filter - start with first 3 chars
    const typeLengths = [3, 5, Math.min(10, value.length), value.length]

    for (const len of typeLengths) {
      const partialValue = value.slice(0, len)
      logger.info(`[ToolExecutor] Typing "${partialValue}" to filter dropdown...`)

      // Clear and type partial value
      await browserView.webContents.executeJavaScript(`
        (() => {
          const el = document.querySelector(${selectorJson});
          if (!el) return { success: false };

          el.focus();
          const isInput = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
          if (isInput) {
            const prototype = el instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
            const nativeSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
            if (nativeSetter) {
              nativeSetter.call(el, ${JSON.stringify(partialValue)});
            } else {
              el.value = ${JSON.stringify(partialValue)};
            }
          }
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return { success: true };
        })()
      `)

      await new Promise(resolve => setTimeout(resolve, COMBOBOX_DROPDOWN_DELAY_MS))

      result = await findAndSelectOption(value) as ToolResult & { selectedText?: string; matchScore?: number; availableOptions?: string[] }

      if (result.success) {
        logger.info(`[ToolExecutor] Combobox selected (after typing "${partialValue}"): "${result.selectedText}" (score: ${result.matchScore})`)
        return result
      }
    }

    // Step 4: Fallback - press Enter to accept typed value
    logger.warn(`[ToolExecutor] No dropdown match found, trying Enter key...`)
    const enterResult = await handleKeypress({ key: "Enter" })

    if (enterResult?.success) {
      logger.info(`[ToolExecutor] Accepted typed value via Enter`)
      return { success: true, data: { selectedText: value, note: "Accepted via Enter key" } }
    }

    // Return failure with available options for the agent to try
    logger.warn(`[ToolExecutor] select_combobox failed completely`)
    return {
      success: false,
      error: `Could not find or select a matching option for "${value}"`,
      data: {
        searchedFor: value,
        availableOptions: result.availableOptions || [],
        hint: "Try using peek_dropdown to see available options, then call select_combobox with the EXACT option text."
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}

/**
 * Set checkbox or radio button state
 */
async function handleSetCheckbox(params: { selector: string; checked: boolean }): Promise<ToolResult> {
  if (!browserView) {
    return { success: false, error: "BrowserView not initialized" }
  }

  const { selector, checked } = params

  if (!selector || typeof checked !== "boolean") {
    return { success: false, error: "set_checkbox requires selector and checked (boolean)" }
  }

  try {
    const selectorJson = JSON.stringify(selector)
    const result = await browserView.webContents.executeJavaScript(`
      (() => {
        const selector = ${selectorJson};
        const targetChecked = ${checked};
        const el = document.querySelector(selector);
        if (!el) return { success: false, error: 'Element not found: ' + selector };
        if (el.type !== 'checkbox' && el.type !== 'radio') {
          return { success: false, error: 'Element is not a checkbox/radio: ' + el.type };
        }
        if (el.disabled) return { success: false, error: 'Element is disabled: ' + selector };

        const wasChecked = el.checked;

        // Only act if state needs to change
        if (wasChecked !== targetChecked) {
          // Focus first
          el.focus();

          // For proper event handling, simulate a click which naturally toggles the state
          // Use MouseEvent for better framework compatibility
          el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));

          // If click didn't toggle (some frameworks prevent default), force it
          if (el.checked !== targetChecked) {
            el.checked = targetChecked;
            el.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }

        return { success: true, selector: selector, checked: el.checked };
      })()
    `)

    if (result.success) {
      logger.info(`[ToolExecutor] Set ${selector} checked=${result.checked}`)
    } else {
      logger.warn(`[ToolExecutor] set_checkbox failed: ${result.error}`)
    }

    return result
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}

/**
 * Click an element by CSS selector
 */
async function handleClickElement(params: { selector: string }): Promise<ToolResult> {
  if (!browserView) {
    return { success: false, error: "BrowserView not initialized" }
  }

  const { selector } = params

  if (!selector) {
    return { success: false, error: "click_element requires selector" }
  }

  try {
    const selectorJson = JSON.stringify(selector)
    const result = await browserView.webContents.executeJavaScript(`
      (() => {
        const selector = ${selectorJson};
        const el = document.querySelector(selector);
        if (!el) return { success: false, error: 'Element not found: ' + selector };

        // Block navigation away from the application by disallowing external links
        if (el.tagName === 'A') {
          const href = el.href || '';
          try {
            const target = new URL(href, window.location.href);
            if (target.origin !== window.location.origin) {
              return { success: false, error: 'Navigation blocked: link points outside current site' };
            }
          } catch (e) {
            return { success: false, error: 'Navigation blocked: invalid link href' };
          }
        }

        // Scroll element into view if needed
        el.scrollIntoView({ behavior: 'instant', block: 'center' });

        // Get element text for logging
        const text = (el.textContent || '').trim().slice(0, 50) || (el.value || '');

        // Focus and click
        el.focus();
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));

        return { success: true, selector: selector, text: text };
      })()
    `)

    if (result.success) {
      logger.info(`[ToolExecutor] Clicked element ${selector} ("${result.text}")`)
    } else {
      logger.warn(`[ToolExecutor] click_element failed: ${result.error}`)
    }

    return result
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}

/**
 * Get all clickable buttons on the page
 * Enhanced to detect custom UI frameworks (React, Vue, custom design systems)
 */
async function handleGetButtons(): Promise<ToolResult> {
  if (!browserView) {
    return { success: false, error: "BrowserView not initialized" }
  }

  const buttons = await browserView.webContents.executeJavaScript(`
    (() => {
      // Helper: Build a unique CSS selector path for an element
      function buildSelectorPath(el) {
        if (el.id) {
          return '#' + CSS.escape(el.id);
        }
        // Try data-testid or data-qa (common in modern apps)
        const testId = el.getAttribute('data-testid') || el.getAttribute('data-qa') || el.getAttribute('data-cy');
        if (testId) {
          const selector = '[data-testid="' + CSS.escape(testId) + '"]';
          if (document.querySelectorAll(selector).length === 1) return selector;
        }
        if (el.name) {
          const tag = el.tagName.toLowerCase();
          const nameSelector = tag + '[name="' + CSS.escape(el.name) + '"]';
          if (document.querySelectorAll(nameSelector).length === 1) {
            return nameSelector;
          }
        }
        const path = [];
        let current = el;
        while (current && current !== document.body) {
          let segment = current.tagName.toLowerCase();
          if (current.id) {
            path.unshift('#' + CSS.escape(current.id));
            break;
          }
          const parent = current.parentElement;
          if (parent) {
            const siblings = Array.from(parent.children).filter(c => c.tagName === current.tagName);
            if (siblings.length > 1) {
              const index = siblings.indexOf(current) + 1;
              segment += ':nth-of-type(' + index + ')';
            }
          }
          path.unshift(segment);
          current = current.parentElement;
        }
        if (path.length > 0 && !path[0].startsWith('#')) {
          path.unshift('body');
        }
        return path.join(' > ');
      }

      // Expanded selectors for modern UI frameworks and custom design systems
      const selectorPatterns = [
        'button',
        '[role="button"]',              // ARIA buttons (any element)
        '[type="button"]',
        'a.btn', 'a.button',
        '[onclick]',
        '[data-action]',
        '[data-testid*="add"]',         // Test IDs containing "add"
        '[data-testid*="button"]',
        '[data-qa*="add"]',
        '[class*="button"]',            // Classes containing "button"
        '[class*="btn-"]',
        '[class*="-btn"]',
      ].join(', ');

      const elements = document.querySelectorAll(selectorPatterns);
      const seen = new Set();
      const results = [];

      // Also find elements by text content for "Add Another" patterns
      const addPatterns = /add\\s*(another|more|new|education|experience|employment|entry)/i;
      const allElements = document.querySelectorAll('*');

      for (const el of allElements) {
        // Skip if already processed
        const selector = buildSelectorPath(el);
        if (seen.has(selector)) continue;

        const text = (el.textContent || '').trim();
        const isClickable = el.matches(selectorPatterns) ||
                           (el.style.cursor === 'pointer') ||
                           (window.getComputedStyle(el).cursor === 'pointer');
        const hasAddText = addPatterns.test(text) && text.length < 50; // Short text with "add"

        // Include if it's clickable OR has "add" text pattern
        if (!isClickable && !hasAddText) continue;

        const rect = el.getBoundingClientRect();

        // Skip invisible or disabled
        if (rect.width === 0 || rect.height === 0) continue;
        if (el.disabled) continue;
        // Skip elements far outside viewport (likely hidden)
        if (rect.top < -1000 || rect.top > window.innerHeight + 1000) continue;

        const displayText = text.slice(0, 100) || el.getAttribute('aria-label') || '';

        // Skip submit/apply buttons
        const lowerText = displayText.toLowerCase();
        if (lowerText.includes('submit') || lowerText.includes('apply now') || lowerText === 'apply') continue;

        // Skip empty text unless it has an aria-label
        if (!displayText) continue;

        seen.add(selector);
        results.push({
          selector: selector,
          text: displayText,
          type: el.tagName.toLowerCase(),
          role: el.getAttribute('role') || null,
          x: Math.round(rect.left + rect.width / 2),
          y: Math.round(rect.top + rect.height / 2),
        });
      }

      return results;
    })()
  `)

  // Filter to most relevant buttons (add, education, employment, experience)
  const relevantKeywords = ['add', 'another', 'education', 'employment', 'experience', 'work', 'history', 'new', 'more', 'entry', 'position', 'degree', 'school', 'job'];
  const relevantButtons = buttons.filter((b: { text: string }) => {
    const lowerText = b.text.toLowerCase();
    return relevantKeywords.some(keyword => lowerText.includes(keyword));
  });

  logger.info(`[ToolExecutor] Found ${buttons.length} buttons, ${relevantButtons.length} relevant for dynamic forms`)

  return {
    success: true,
    data: {
      buttons: relevantButtons.length > 0 ? relevantButtons : buttons.slice(0, 30),
      totalFound: buttons.length,
      hint: relevantButtons.length === 0 ? "No 'Add' buttons found. Try scrolling or look for icons (+) that add entries." : null
    }
  }
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

  // Scale coordinates from screenshot space to browser space
  const clickX = Math.round(x * screenshotScale)
  const clickY = Math.round(y * screenshotScale)

  // Validate coordinates
  if (clickX < 0 || clickY < 0 || clickX > bounds.width || clickY > bounds.height) {
    return { success: false, error: `Coordinates out of bounds: (${x}, ${y}) -> (${clickX}, ${clickY})` }
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
      x: clickX,
      y: clickY,
      button: "left",
      clickCount: 1,
    })
    await debugger_.sendCommand("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: clickX,
      y: clickY,
      button: "left",
      clickCount: 1,
    })

    logger.info(`[ToolExecutor] Clicked (${x}, ${y}) -> (${clickX}, ${clickY})`)
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

/**
 * Get user profile data
 */
function handleGetUserProfile(): ToolResult {
  if (!userProfile) {
    return { success: false, error: "User profile not available" }
  }

  // Log a preview of the profile data
  const preview = typeof userProfile === "string"
    ? userProfile.slice(0, 200)
    : JSON.stringify(userProfile).slice(0, 200)
  logger.info(`[ToolExecutor] Returning user profile (${typeof userProfile}): ${preview}...`)
  return { success: true, data: userProfile }
}

/**
 * Get job context data
 */
function handleGetJobContext(): ToolResult {
  if (!jobContext) {
    return { success: false, error: "Job context not available" }
  }

  logger.info("[ToolExecutor] Returning job context")
  return { success: true, data: jobContext }
}

/**
 * Upload a document (resume or cover letter) to a file input on the page
 */
async function handleUploadFile(params: { selector: string; type: "resume" | "coverLetter" }): Promise<ToolResult> {
  const { selector, type } = params

  if (!selector) {
    return { success: false, error: "upload_file requires a selector for the file input element" }
  }

  if (!type || (type !== "resume" && type !== "coverLetter")) {
    return { success: false, error: "upload_file requires type: 'resume' or 'coverLetter'" }
  }

  // Get the document URL for the requested type
  const documentUrl = type === "resume" ? documentUrls.resumeUrl : documentUrls.coverLetterUrl

  if (!documentUrl) {
    const typeLabel = type === "coverLetter" ? "cover letter" : "resume"
    return {
      success: false,
      error: `No ${typeLabel} selected. The user must select a ${typeLabel} before starting form fill.`,
    }
  }

  if (!uploadCallback) {
    return { success: false, error: "Upload functionality not configured: callback not initialized" }
  }

  const typeLabel = type === "coverLetter" ? "cover letter" : "resume"
  logger.info(`[ToolExecutor] Uploading ${typeLabel} to ${selector}: ${documentUrl}`)

  try {
    const result = await uploadCallback(selector, type, documentUrl)

    if (result.success) {
      logger.info(`[ToolExecutor] Upload successful: ${result.message}`)
      return { success: true, data: { message: result.message, type, selector } }
    } else {
      logger.warn(`[ToolExecutor] Upload failed: ${result.message}`)
      return { success: false, error: result.message }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error(`[ToolExecutor] Upload error: ${message}`)
    return { success: false, error: message }
  }
}

/**
 * Find file upload areas on the page
 * Returns file inputs (including hidden ones) and their associated trigger buttons
 */
async function handleFindUploadAreas(): Promise<ToolResult> {
  if (!browserView) {
    return { success: false, error: "BrowserView not initialized" }
  }

  const uploadAreas = await browserView.webContents.executeJavaScript(`
    (() => {
      // Helper: Build a unique CSS selector path for an element
      function buildSelectorPath(el) {
        if (el.id) return '#' + CSS.escape(el.id);
        const testId = el.getAttribute('data-testid') || el.getAttribute('data-qa');
        if (testId) {
          const selector = '[data-testid="' + CSS.escape(testId) + '"]';
          if (document.querySelectorAll(selector).length === 1) return selector;
        }
        if (el.name) {
          const tag = el.tagName.toLowerCase();
          const nameSelector = tag + '[name="' + CSS.escape(el.name) + '"]';
          if (document.querySelectorAll(nameSelector).length === 1) return nameSelector;
        }
        const path = [];
        let current = el;
        while (current && current !== document.body) {
          let segment = current.tagName.toLowerCase();
          if (current.id) {
            path.unshift('#' + CSS.escape(current.id));
            break;
          }
          const parent = current.parentElement;
          if (parent) {
            const siblings = Array.from(parent.children).filter(c => c.tagName === current.tagName);
            if (siblings.length > 1) {
              const index = siblings.indexOf(current) + 1;
              segment += ':nth-of-type(' + index + ')';
            }
          }
          path.unshift(segment);
          current = current.parentElement;
        }
        if (path.length > 0 && !path[0].startsWith('#')) path.unshift('body');
        return path.join(' > ');
      }

      const results = [];

      // Find all file inputs (including hidden ones)
      const fileInputs = document.querySelectorAll('input[type="file"]');

      for (const input of fileInputs) {
        const rect = input.getBoundingClientRect();
        const isHidden = rect.width === 0 || rect.height === 0 || input.offsetParent === null;

        // Get accepted file types
        const accept = input.getAttribute('accept') || '*';

        // Try to find associated label or trigger button
        let triggerButton = null;
        let triggerSelector = null;
        let label = input.getAttribute('aria-label') || '';

        // Check for label[for]
        if (input.id) {
          const labelEl = document.querySelector('label[for="' + CSS.escape(input.id) + '"]');
          if (labelEl) {
            label = labelEl.textContent?.trim() || label;
            if (isHidden) {
              triggerButton = labelEl;
              triggerSelector = buildSelectorPath(labelEl);
            }
          }
        }

        // Check parent/ancestor for clickable container
        if (isHidden && !triggerButton) {
          let parent = input.parentElement;
          for (let i = 0; i < 5 && parent; i++) {
            const parentRect = parent.getBoundingClientRect();
            if (parentRect.width > 0 && parentRect.height > 0) {
              const text = parent.textContent?.trim()?.slice(0, 100) || '';
              // Look for upload-related text
              if (/attach|upload|browse|drag|drop|resume|cv|cover/i.test(text)) {
                triggerButton = parent;
                triggerSelector = buildSelectorPath(parent);
                if (!label) label = text.slice(0, 50);
                break;
              }
            }
            parent = parent.parentElement;
          }
        }

        // Determine if this is for resume or cover letter
        const contextText = (label + ' ' + (input.name || '') + ' ' + (input.id || '')).toLowerCase();
        let documentType = 'unknown';
        if (/resume|cv|curriculum/i.test(contextText)) {
          documentType = 'resume';
        } else if (/cover.?letter/i.test(contextText)) {
          documentType = 'coverLetter';
        }

        results.push({
          inputSelector: buildSelectorPath(input),
          triggerSelector: triggerSelector,
          label: label || 'File upload',
          accept: accept,
          isHidden: isHidden,
          documentType: documentType,
          x: isHidden && triggerButton ? Math.round(triggerButton.getBoundingClientRect().left + triggerButton.getBoundingClientRect().width / 2) : Math.round(rect.left + rect.width / 2),
          y: isHidden && triggerButton ? Math.round(triggerButton.getBoundingClientRect().top + triggerButton.getBoundingClientRect().height / 2) : Math.round(rect.top + rect.height / 2),
        });
      }

      // Also look for drag-and-drop zones without file inputs
      const dropZones = document.querySelectorAll('[class*="drop"], [class*="upload"], [data-testid*="upload"], [data-testid*="drop"]');
      for (const zone of dropZones) {
        const rect = zone.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;

        // Check if there's already a file input result for this area
        const hasInput = results.some(r => {
          const inputRect = document.querySelector(r.inputSelector)?.getBoundingClientRect();
          if (!inputRect) return false;
          // Check if overlapping
          return !(inputRect.right < rect.left || inputRect.left > rect.right ||
                   inputRect.bottom < rect.top || inputRect.top > rect.bottom);
        });

        if (!hasInput) {
          const text = zone.textContent?.trim()?.slice(0, 100) || '';
          if (/drag|drop|upload|attach|browse/i.test(text)) {
            results.push({
              inputSelector: null,
              triggerSelector: buildSelectorPath(zone),
              label: text.slice(0, 50) || 'Drop zone',
              accept: '*',
              isHidden: false,
              documentType: /resume|cv/i.test(text) ? 'resume' : (/cover/i.test(text) ? 'coverLetter' : 'unknown'),
              x: Math.round(rect.left + rect.width / 2),
              y: Math.round(rect.top + rect.height / 2),
              note: 'Drop zone without direct file input - may need to click to open file dialog'
            });
          }
        }
      }

      return results;
    })()
  `)

  logger.info(`[ToolExecutor] Found ${uploadAreas.length} upload areas`)

  return {
    success: true,
    data: {
      uploadAreas,
      hint: uploadAreas.length === 0
        ? "No file upload areas found. Scroll down to reveal more of the form."
        : "Use upload_file with the inputSelector. If isHidden=true, the triggerSelector can be clicked to open file dialog."
    }
  }
}

