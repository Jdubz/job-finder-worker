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
  logger.info("[ToolExecutor] Job context cleared")
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

        // Skip hidden, file inputs, and invisible/disabled fields early
        if (fieldType === 'hidden' || fieldType === 'file') return null;
        if (rect.width === 0 || rect.height === 0) return null;
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
    const result = await browserView.webContents.executeJavaScript(`
      (() => {
        const selector = ${selectorJson};
        const value = ${valueJson};
        const el = document.querySelector(selector);
        if (!el) return { success: false, error: 'Element not found: ' + selector };
        if (el.disabled) return { success: false, error: 'Element is disabled: ' + selector };

        // Determine element type for proper native setter
        const isInput = el instanceof HTMLInputElement;
        const isTextarea = el instanceof HTMLTextAreaElement;

        if (!isInput && !isTextarea) {
          // For contenteditable or other elements, try direct approach
          el.focus();
          el.textContent = value;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return { success: true, selector: selector, value: value };
        }

        // Get the native value setter - this bypasses React/Vue/Angular's override
        const prototype = isInput ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
        const nativeSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

        // Focus the element first
        el.focus();

        if (!nativeSetter) {
          // Fallback to direct assignment if native setter not found
          el.value = value;
        } else {
          // Use native setter to bypass framework interception
          nativeSetter.call(el, value);
        }

        // Dispatch input event - React uses this via its synthetic event system
        // The key is that React listens for 'input' events on the document and
        // checks the event target's value property (which we set via native setter)
        el.dispatchEvent(new Event('input', { bubbles: true }));

        // Also dispatch change event for other frameworks and native validation
        el.dispatchEvent(new Event('change', { bubbles: true }));

        // Verify the value stuck
        const finalValue = el.value;
        if (finalValue !== value) {
          return {
            success: false,
            error: 'Value did not persist after setting',
            attempted: value,
            actual: finalValue
          };
        }

        return { success: true, selector: selector, value: finalValue };
      })()
    `)

    if (result.success) {
      logger.info(`[ToolExecutor] Filled ${selector} with "${value.slice(0, 50)}${value.length > 50 ? "..." : ""}"`)
    } else {
      logger.warn(`[ToolExecutor] fill_field failed: ${result.error}`)
    }

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

/**
 * Select from a searchable dropdown (combobox/autocomplete)
 * Types into the input, waits for dropdown, then clicks the matching option
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
    const valueJson = JSON.stringify(value)

    // Step 1: Focus and clear the input, then type the value
    const typeResult = await browserView.webContents.executeJavaScript(`
      (() => {
        const selector = ${selectorJson};
        const value = ${valueJson};
        const el = document.querySelector(selector);
        if (!el) return { success: false, error: 'Element not found: ' + selector };
        if (el.disabled) return { success: false, error: 'Element is disabled: ' + selector };

        // Focus and clear
        el.focus();
        el.value = '';

        // Use native setter for React compatibility
        const isInput = el instanceof HTMLInputElement;
        const isTextarea = el instanceof HTMLTextAreaElement;
        if (isInput || isTextarea) {
          const prototype = isInput ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
          const nativeSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
          if (nativeSetter) {
            nativeSetter.call(el, value);
          } else {
            el.value = value;
          }
        } else {
          el.value = value;
        }

        // Dispatch events to trigger dropdown
        el.dispatchEvent(new Event('focus', { bubbles: true }));
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
        el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));

        return { success: true, typedValue: el.value };
      })()
    `)

    if (!typeResult.success) {
      return typeResult
    }

    // Step 2: Wait for dropdown to appear
    await new Promise(resolve => setTimeout(resolve, 300))

    // Step 3: Find and click the matching option in the dropdown
    const selectResult = await browserView.webContents.executeJavaScript(`
      (() => {
        const targetValue = ${valueJson}.toLowerCase();

        // Common dropdown selectors used by UI libraries
        const dropdownSelectors = [
          '[role="listbox"] [role="option"]',
          '[role="listbox"] li',
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
          // Generic visible dropdowns
          '[data-value]',
        ];

        let matchingOption = null;
        let allOptions = [];

        for (const dropdownSelector of dropdownSelectors) {
          const options = document.querySelectorAll(dropdownSelector);
          if (options.length === 0) continue;

          for (const opt of options) {
            // Skip hidden options
            const rect = opt.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) continue;
            const style = window.getComputedStyle(opt);
            if (style.display === 'none' || style.visibility === 'hidden') continue;

            const text = opt.textContent?.trim().toLowerCase() || '';
            const dataValue = opt.getAttribute('data-value')?.toLowerCase() || '';
            allOptions.push(opt.textContent?.trim() || dataValue);

            // Check for match
            if (text === targetValue || dataValue === targetValue ||
                text.includes(targetValue) || targetValue.includes(text)) {
              matchingOption = opt;
              break;
            }
          }
          if (matchingOption) break;
        }

        if (!matchingOption) {
          return {
            success: false,
            error: 'No matching option found in dropdown',
            searchedFor: targetValue,
            availableOptions: allOptions.slice(0, 10).join(', ')
          };
        }

        // Click the option
        matchingOption.scrollIntoView({ block: 'nearest' });
        matchingOption.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        matchingOption.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
        matchingOption.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

        return {
          success: true,
          selectedText: matchingOption.textContent?.trim(),
          selectedValue: matchingOption.getAttribute('data-value') || matchingOption.textContent?.trim()
        };
      })()
    `)

    if (selectResult.success) {
      logger.info(`[ToolExecutor] Combobox selected: "${selectResult.selectedText}"`)
    } else {
      logger.warn(`[ToolExecutor] select_combobox failed: ${selectResult.error}`)
      // If dropdown selection failed, try pressing Enter (some comboboxes accept typed value on Enter)
      logger.info(`[ToolExecutor] Trying Enter key as fallback...`)
      await handleKeypress({ key: "Enter" })
    }

    return selectResult
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

        // Scroll element into view if needed
        el.scrollIntoView({ behavior: 'instant', block: 'center' });

        // Get element text for logging
        const text = el.textContent?.trim()?.slice(0, 50) || el.value || '';

        // Focus and click
        if (el.focus) el.focus();
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

      // Find buttons, links that look like buttons, and elements with click handlers
      const elements = document.querySelectorAll('button, a[role="button"], [type="button"], [type="submit"], a.btn, a.button, [onclick], [data-action]');

      return Array.from(elements).map((el, idx) => {
        const rect = el.getBoundingClientRect();

        // Skip invisible or disabled elements
        if (rect.width === 0 || rect.height === 0) return null;
        if (el.disabled) return null;

        const text = el.textContent?.trim() || el.value || el.getAttribute('aria-label') || '';

        // Skip submit/apply buttons (user should click these manually)
        const lowerText = text.toLowerCase();
        if (lowerText.includes('submit') || lowerText.includes('apply now') || lowerText === 'apply') return null;

        return {
          selector: buildSelectorPath(el),
          text: text.slice(0, 100),
          type: el.tagName.toLowerCase(),
          x: Math.round(rect.left + rect.width / 2),
          y: Math.round(rect.top + rect.height / 2),
        };
      }).filter(b => b !== null && b.text.length > 0);
    })()
  `)

  // Filter to most relevant buttons (add, education, employment, experience)
  const relevantKeywords = ['add', 'another', 'education', 'employment', 'experience', 'work', 'history', 'new', 'more'];
  const relevantButtons = buttons.filter((b: { text: string }) => {
    const lowerText = b.text.toLowerCase();
    return relevantKeywords.some(keyword => lowerText.includes(keyword));
  });

  logger.info(`[ToolExecutor] Found ${buttons.length} buttons, ${relevantButtons.length} relevant for dynamic forms`)

  return {
    success: true,
    data: {
      buttons: relevantButtons.length > 0 ? relevantButtons : buttons.slice(0, 20),
      totalFound: buttons.length
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

