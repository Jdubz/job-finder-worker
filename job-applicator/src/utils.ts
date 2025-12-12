/**
 * Utility functions for the job-applicator Electron app.
 *
 * ## Error Handling Patterns
 *
 * This module provides utilities for consistent error handling across IPC handlers.
 * Use these patterns to ensure user-friendly error messages and proper logging.
 *
 * ### Pattern 1: Simple IPC Handler (recommended for new handlers)
 *
 * Use `createIpcHandler` wrapper for automatic error handling and logging:
 *
 * ```typescript
 * ipcMain.handle("get-data", createIpcHandler({
 *   name: "get-data",
 *   logger,
 * }, async (_event, id: string) => {
 *   const fetchResult = await fetchForIpc(
 *     `${API_URL}/data/${id}`,
 *     fetchOptions(),
 *     { name: "get-data", logger }
 *   )
 *   if (!fetchResult.success) return fetchResult
 *
 *   const data = await fetchResult.response.json()
 *   return { success: true, data }
 * }))
 * ```
 *
 * ### Pattern 2: Manual Error Handling (for complex handlers)
 *
 * For handlers that need custom logic, use the utilities directly:
 *
 * ```typescript
 * ipcMain.handle("complex-action", async (_event, params) => {
 *   try {
 *     const res = await fetchWithRetry(url, options, { maxRetries: 2, timeoutMs: 15000 })
 *
 *     if (!res.ok) {
 *       const errorMsg = await parseApiError(res)
 *       return { success: false, message: errorMsg }
 *     }
 *
 *     const data = await res.json()
 *     // Validate response structure
 *     if (!data?.items || !Array.isArray(data.items)) {
 *       return { success: false, message: "Invalid response format" }
 *     }
 *
 *     return { success: true, data: data.items }
 *   } catch (err) {
 *     const message = getUserFriendlyErrorMessage(err instanceof Error ? err : new Error(String(err)), logger)
 *     return { success: false, message }
 *   }
 * })
 * ```
 *
 * ### Key Utilities
 *
 * - `fetchWithRetry(url, options, config)` - Fetch with timeout and retry support
 * - `parseApiError(response)` - Extract error message from API response
 * - `getUserFriendlyErrorMessage(error, logger?)` - Convert technical errors to user-friendly messages
 * - `createIpcHandler(config, handler)` - Wrapper with automatic error handling
 * - `fetchForIpc(url, options, config)` - Fetch wrapper for IPC handlers
 *
 * ### Response Validation
 *
 * Always validate response structure before accessing nested properties:
 *
 * ```typescript
 * const data = await res.json()
 * // Bad: data.items.map(...) - could throw if items is undefined
 * // Good: Validate first
 * if (!data || !Array.isArray(data.items)) {
 *   return { success: false, message: "Invalid response" }
 * }
 * ```
 *
 * @module utils
 */

import * as path from "path"
import type { JobMatchWithListing } from "./types.js"

// Configuration from environment (can be overridden in tests)
export const getConfig = () => ({
  CDP_PORT: process.env.CDP_PORT || "9222",
  API_URL: process.env.JOB_FINDER_API_URL || "http://localhost:3000/api",
  ARTIFACTS_DIR: process.env.GENERATOR_ARTIFACTS_DIR || "/data/artifacts",
})

// Normalize URL for comparison (origin + pathname only)
export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url)
    return `${parsed.origin}${parsed.pathname}`
  } catch {
    return url
  }
}

// Resolve document file path from API URL
export function resolveDocumentPath(documentUrl: string, artifactsDir?: string): string {
  const config = getConfig()
  const baseDir = artifactsDir ?? config.ARTIFACTS_DIR

  // documentUrl is like "/api/generator/artifacts/2025-12-04/filename.pdf"
  // Extract the relative path after /api/generator/artifacts/
  const prefix = "/api/generator/artifacts/"
  if (documentUrl.startsWith(prefix)) {
    const relativePath = documentUrl.substring(prefix.length)
    return path.join(baseDir, relativePath)
  }
  // If it's already an absolute path, return as-is
  if (path.isAbsolute(documentUrl)) {
    return documentUrl
  }
  // Otherwise treat as relative to artifacts dir
  return path.join(baseDir, documentUrl)
}

// Normalize varying API response shapes for job match payloads
export type ListingInfo = {
  title?: string
  companyName?: string
  url?: string
  description?: string
  location?: string
}

export function unwrapJobMatch(response: unknown): JobMatchWithListing | Record<string, unknown> | unknown {
  if (!response || typeof response !== "object") return response
  const obj = response as Record<string, unknown>
  const data = obj.data
  if (data && typeof data === "object") {
    const dataObj = data as Record<string, unknown>
    if (dataObj.match) return dataObj.match
    return dataObj
  }
  if (obj.match) return obj.match
  return response
}

// Normalize generator documents listing payloads
export function unwrapDocuments(response: unknown): unknown[] {
  if (Array.isArray(response)) return response
  if (response && typeof response === "object") {
    const data = (response as Record<string, unknown>).data
    if (Array.isArray(data)) return data
    if (data && typeof data === "object" && Array.isArray((data as Record<string, unknown>).requests)) {
      return (data as Record<string, unknown>).requests as unknown[]
    }
  }
  return []
}

// Safely extract listing information from a match payload
export function getListingFromMatch(match: unknown): ListingInfo | undefined {
  if (!match || typeof match !== "object" || !("listing" in match)) return undefined
  const listing = (match as { listing?: ListingInfo }).listing
  if (listing && typeof listing === "object") {
    return listing
  }
  return undefined
}

// NOTE: EEO/application data is provided as free-form text via personalInfo.applicationInfo.
// No structured option maps are maintained; the prompt builder passes the text through directly.

// Re-export types from types.ts for backwards compatibility
export type {
  JobExtraction,
} from "./types.js"

// Build job extraction prompt
export function buildExtractionPrompt(pageContent: string, url: string): string {
  return `Extract job listing details from this page content.

URL: ${url}

Page Content:
${pageContent}

Return a JSON object with these fields (use null if not found):
{
  "title": "Job title",
  "description": "Full job description (include requirements, responsibilities)",
  "location": "Job location (e.g., Remote, Portland, OR)",
  "techStack": "Technologies mentioned (comma-separated)",
  "companyName": "Company name"
}

Return ONLY valid JSON, no markdown, no explanation.`
}

// Find matching bracket/brace pair starting from given position
function findMatchingBracket(str: string, startIdx: number, openChar: string, closeChar: string): number {
  let depth = 0
  let inString = false
  let escapeNext = false

  for (let i = startIdx; i < str.length; i++) {
    const char = str[i]

    if (escapeNext) {
      escapeNext = false
      continue
    }

    if (char === "\\") {
      escapeNext = true
      continue
    }

    if (char === '"') {
      inString = !inString
      continue
    }

    if (inString) continue

    if (char === openChar) {
      depth++
    } else if (char === closeChar) {
      depth--
      if (depth === 0) {
        return i
      }
    }
  }

  return -1
}

// Parse JSON array from CLI output (handles extra text around JSON)
export function parseJsonArrayFromOutput(output: string): unknown[] {
  const startIdx = output.indexOf("[")
  if (startIdx === -1) {
    throw new Error(`No JSON array found in output: ${output.slice(0, 200)}`)
  }

  // Find the matching closing bracket
  const endIdx = findMatchingBracket(output, startIdx, "[", "]")
  if (endIdx === -1) {
    throw new Error(`Unmatched JSON array brackets in output: ${output.slice(0, 200)}`)
  }

  const jsonStr = output.substring(startIdx, endIdx + 1)
  const parsed = JSON.parse(jsonStr)
  if (!Array.isArray(parsed)) {
    throw new Error("Parsed JSON is not an array")
  }
  return parsed
}

// Parse JSON object from CLI output (handles extra text around JSON)
export function parseJsonObjectFromOutput(output: string): Record<string, unknown> {
  const startIdx = output.indexOf("{")
  if (startIdx === -1) {
    throw new Error(`No JSON object found in output: ${output.slice(0, 200)}`)
  }

  // Find the matching closing brace
  const endIdx = findMatchingBracket(output, startIdx, "{", "}")
  if (endIdx === -1) {
    throw new Error(`Unmatched JSON object braces in output: ${output.slice(0, 200)}`)
  }

  const jsonStr = output.substring(startIdx, endIdx + 1)
  const parsed = JSON.parse(jsonStr)
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Parsed JSON is not an object")
  }
  return parsed
}

/**
 * Extract a JSON-bearing string from a wrapper object. Some CLI tools return
 * `{ type: "result", output_text: "<json>" }` or similar instead of the
 * expected `{ result: "<json>" }` shape. This helper finds the first string
 * value that looks like JSON so we can still parse the payload.
 */
function extractJsonStringFromWrapper(obj: Record<string, unknown>): string | undefined {
  const candidateKeys = ["result", "output_text", "outputText", "text", "completion", "message"]
  for (const key of candidateKeys) {
    const value = obj[key]
    if (typeof value === "string") return value
  }

  // As a last resort, scan for any string value that looks like it might be JSON
  for (const value of Object.values(obj)) {
    if (typeof value === "string" && /[[{]/.test(value)) {
      return value
    }
  }
  return undefined
}

/**
 * Parse CLI output that may include wrapper objects with a `result` field.
 * Handles:
 * - Raw arrays
 * - Objects whose `result` is a string containing JSON
 * - Objects whose `result` is already an array
 */
export function parseCliArrayOutput(output: string): unknown[] {
  try {
    const parsed = JSON.parse(output)
    if (Array.isArray(parsed)) return parsed

    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>
      if ("result" in record) {
        const inner = record.result
        if (typeof inner === "string") {
          return parseJsonArrayFromOutput(inner)
        }
        if (Array.isArray(inner)) {
          return inner
        }
      }

      const wrapped = extractJsonStringFromWrapper(record)
      if (wrapped) {
        return parseJsonArrayFromOutput(wrapped)
      }

      const firstArray = Object.values(record).find((value): value is unknown[] => Array.isArray(value))
      if (firstArray) return firstArray
    }
  } catch {
    // fall through to string search parser
  }
  return parseJsonArrayFromOutput(output)
}

/**
 * Parse CLI output that may include wrapper objects with a `result` field.
 * Handles:
 * - Raw objects
 * - Objects whose `result` is a string containing JSON
 * - Objects whose `result` is already an object
 */
export function parseCliObjectOutput(output: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(output)
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const record = parsed as Record<string, unknown>
      if ("result" in record) {
        const inner = record.result
        if (typeof inner === "string") {
          return parseJsonObjectFromOutput(inner)
        }
        if (inner && typeof inner === "object" && !Array.isArray(inner)) {
          return inner as Record<string, unknown>
        }
      }

      const wrapped = extractJsonStringFromWrapper(record)
      if (wrapped) {
        return parseJsonObjectFromOutput(wrapped)
      }

      const firstObject = Object.values(record).find(
        (value): value is Record<string, unknown> =>
          Boolean(value) && typeof value === "object" && !Array.isArray(value)
      )
      if (firstObject) return firstObject

      return record
    }
  } catch {
    // fall through to string search parser
  }
  return parseJsonObjectFromOutput(output)
}

// =============================================================================
// HTTP Error Handling Utilities
// =============================================================================

/**
 * Map HTTP status codes to user-friendly error messages
 */
export function getHttpErrorMessage(status: number, statusText?: string): string {
  switch (status) {
    case 400:
      return "Invalid request. Please check your input and try again."
    case 401:
      return "Authentication required. Please check your credentials."
    case 403:
      return "Access denied. You don't have permission for this action."
    case 404:
      return "Resource not found."
    case 408:
      return "Request timed out. Please try again."
    case 409:
      return "Conflict with existing data. Please refresh and try again."
    case 422:
      return "Invalid data provided. Please check your input."
    case 429:
      return "Too many requests. Please wait a moment and try again."
    case 500:
      return "Server error. Please try again later."
    case 502:
      return "Server temporarily unavailable. Please try again later."
    case 503:
      return "Service unavailable. Please try again later."
    case 504:
      return "Server took too long to respond. Please try again."
    default:
      return statusText ? `Error ${status}: ${statusText}` : `Error ${status}`
  }
}

/**
 * Parse error message from API response body.
 * Clones the response first to avoid consuming the body stream.
 */
export async function parseApiError(response: Response): Promise<string> {
  const status = response.status
  const friendlyMessage = getHttpErrorMessage(status, response.statusText)

  // Clone response so we don't consume the original body stream
  const clonedResponse = response.clone()

  try {
    const body = await clonedResponse.json()
    // Check for standard API error format
    if (body?.error?.message) {
      return body.error.message
    }
    if (body?.message) {
      return body.message
    }
  } catch {
    // Body is not JSON, try text with a fresh clone
    try {
      const textResponse = response.clone()
      const text = await textResponse.text()
      // Only include text if it's short and not HTML (case-insensitive check)
      const textLower = text.toLowerCase()
      if (text && text.length < 200 && !textLower.includes("<!doctype") && !textLower.includes("<html")) {
        return `${friendlyMessage} - ${text}`
      }
    } catch {
      // Ignore text parsing errors
    }
  }

  return friendlyMessage
}

/** Logger interface for optional debug logging */
interface ErrorLogger {
  debug(...args: unknown[]): void
}

/** Maximum length for user-facing error messages */
const MAX_ERROR_MESSAGE_LENGTH = 150

/**
 * Map generic error messages to user-friendly versions.
 * Optionally logs full error message before truncation for debugging.
 *
 * @param error - The error to convert
 * @param logger - Optional logger for debug output (logs full message before truncation)
 */
export function getUserFriendlyErrorMessage(error: Error | string, logger?: ErrorLogger): string {
  const message = typeof error === "string" ? error : error.message

  // Network errors
  if (message.includes("Failed to fetch") || message.includes("fetch failed")) {
    return "Unable to connect. Please check your internet connection."
  }
  if (message.includes("NetworkError")) {
    return "Network error. Please check your connection and try again."
  }

  // Timeout errors
  if (message.includes("timed out") || message.includes("timeout") || message.includes("AbortError")) {
    return "Request timed out. Please try again."
  }

  // SSL errors
  if (message.includes("SSL") || message.includes("certificate")) {
    return "Security error. The connection may not be secure."
  }

  // DNS errors
  if (message.includes("ENOTFOUND") || message.includes("ERR_NAME_NOT_RESOLVED")) {
    return "Could not find the server. Please check the URL."
  }

  // Connection errors
  if (message.includes("ECONNREFUSED") || message.includes("ERR_CONNECTION_REFUSED")) {
    return "Connection refused. The server may be down."
  }
  if (message.includes("ECONNRESET")) {
    return "Connection was reset. Please try again."
  }

  // Return original if no mapping found, but truncate if too long
  if (message.length > MAX_ERROR_MESSAGE_LENGTH) {
    // Log full message for debugging before truncating for UI
    if (logger) {
      logger.debug("Error message truncated for UI. Full message:", message)
    }
    return message.slice(0, MAX_ERROR_MESSAGE_LENGTH - 3) + "..."
  }

  return message
}

// =============================================================================
// Fetch Utilities
// =============================================================================

/**
 * Fetch with timeout support
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = 30000
): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    })
    return response
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Request timed out after ${timeoutMs}ms`)
    }
    throw err
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Fetch with retry support for transient failures.
 * Throws on final failure instead of returning failed response.
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  config: {
    maxRetries?: number
    timeoutMs?: number
    retryDelayMs?: number
    maxDelayMs?: number
    retryOn?: number[]
  } = {}
): Promise<Response> {
  const {
    maxRetries = 3,
    timeoutMs = 30000,
    retryDelayMs = 1000,
    maxDelayMs = 30000, // Cap retry delay at 30 seconds
    retryOn = [408, 429, 500, 502, 503, 504],
  } = config

  let lastError: Error | null = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, options, timeoutMs)

      // Check if we should retry based on status code
      if (retryOn.includes(response.status) && attempt < maxRetries) {
        const delay = parseRetryDelay(response, retryDelayMs, attempt, maxDelayMs)
        await sleep(delay)
        continue
      }

      // On last attempt with retryable status, throw instead of returning failed response
      if (retryOn.includes(response.status)) {
        throw new Error(`Request failed after ${maxRetries + 1} attempts with status ${response.status}`)
      }

      return response
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))

      // Retry on timeout errors (transient network issues)
      if (lastError.message.includes("timed out") && attempt < maxRetries) {
        const delay = Math.min(retryDelayMs * Math.pow(2, attempt), maxDelayMs)
        await sleep(delay)
        continue
      }

      // Retry on network errors
      if (
        (lastError.message.includes("Failed to fetch") ||
          lastError.message.includes("ECONNRESET") ||
          lastError.message.includes("ECONNREFUSED")) &&
        attempt < maxRetries
      ) {
        const delay = Math.min(retryDelayMs * Math.pow(2, attempt), maxDelayMs)
        await sleep(delay)
        continue
      }

      throw lastError
    }
  }

  throw lastError || new Error("Max retries exceeded")
}

/**
 * Parse Retry-After header and calculate delay with validation
 */
function parseRetryDelay(response: Response, baseDelay: number, attempt: number, maxDelay: number): number {
  const retryAfter = response.headers.get("Retry-After")

  if (retryAfter) {
    // Retry-After can be seconds (number) or HTTP date
    const seconds = parseInt(retryAfter, 10)
    if (!isNaN(seconds) && seconds > 0 && seconds < 3600) {
      // Valid seconds value (cap at 1 hour for safety)
      return Math.min(seconds * 1000, maxDelay)
    }
    // Could be HTTP date format - fall back to exponential backoff
  }

  // Exponential backoff with cap
  return Math.min(baseDelay * Math.pow(2, attempt), maxDelay)
}

/**
 * Sleep utility for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// =============================================================================
// IPC Handler Utilities
// =============================================================================

/**
 * Standard result type for IPC handlers
 */
export interface IpcResult<T = unknown> {
  success: boolean
  data?: T
  message?: string
}

/**
 * Configuration for IPC handler wrapper
 */
export interface IpcHandlerConfig {
  /** Handler name for logging */
  name: string
  /** Optional logger instance */
  logger?: ErrorLogger & { info(...args: unknown[]): void; error(...args: unknown[]): void }
}

/**
 * Creates a standardized IPC handler wrapper with consistent error handling.
 *
 * Features:
 * - Logs handler start/completion with timing
 * - Catches all errors and returns user-friendly messages
 * - Ensures consistent return type { success, data?, message? }
 *
 * @example
 * ```typescript
 * ipcMain.handle("my-action", createIpcHandler({
 *   name: "my-action",
 *   logger,
 * }, async (event, params) => {
 *   // Your handler logic here
 *   const result = await doSomething(params)
 *   return { success: true, data: result }
 * }))
 * ```
 */
export function createIpcHandler<TArgs extends unknown[], TData>(
  config: IpcHandlerConfig,
  handler: (...args: TArgs) => Promise<IpcResult<TData>>
): (...args: TArgs) => Promise<IpcResult<TData>> {
  return async (...args: TArgs): Promise<IpcResult<TData>> => {
    const startTime = Date.now()
    const { name, logger } = config

    try {
      logger?.info(`[${name}] Starting...`)
      const result = await handler(...args)
      const duration = Date.now() - startTime
      logger?.info(`[${name}] Completed in ${duration}ms`)
      return result
    } catch (err) {
      const duration = Date.now() - startTime
      const errorMessage = err instanceof Error ? err.message : String(err)
      logger?.error(`[${name}] Failed after ${duration}ms:`, errorMessage)

      const friendlyMessage = getUserFriendlyErrorMessage(
        err instanceof Error ? err : new Error(String(err)),
        logger
      )
      return { success: false, message: friendlyMessage }
    }
  }
}

/**
 * Wraps a fetch call with standard error handling for IPC handlers.
 *
 * @example
 * ```typescript
 * const result = await fetchForIpc(
 *   `${API_URL}/endpoint`,
 *   fetchOptions(),
 *   { name: "get-data", logger }
 * )
 * if (!result.success) return result
 * // Use result.response
 * ```
 */
export async function fetchForIpc(
  url: string,
  options: RequestInit,
  config: IpcHandlerConfig & { retries?: number; timeoutMs?: number }
): Promise<{ success: true; response: Response } | { success: false; message: string }> {
  const { name, logger, retries = 2, timeoutMs = 15000 } = config

  try {
    const response = await fetchWithRetry(url, options, { maxRetries: retries, timeoutMs })

    if (!response.ok) {
      const errorMsg = await parseApiError(response)
      logger?.error(`[${name}] HTTP ${response.status}:`, errorMsg)
      return { success: false, message: errorMsg }
    }

    return { success: true, response }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    logger?.error(`[${name}] Fetch failed:`, errorMessage)
    const friendlyMessage = getUserFriendlyErrorMessage(
      err instanceof Error ? err : new Error(String(err)),
      logger
    )
    return { success: false, message: friendlyMessage }
  }
}
