/**
 * Electron Tool Server Client
 *
 * HTTP client that communicates with the Electron app's tool server.
 * The tool server exposes browser automation capabilities via a simple HTTP API.
 */

const ELECTRON_URL = process.env.JOB_APPLICATOR_URL || "http://127.0.0.1:19524"

// Timeout for tool execution (2 minutes for long-running tools like document generation)
const TOOL_TIMEOUT_MS = 120000

export interface ToolResult {
  success: boolean
  data?: unknown
  error?: string
}

/**
 * Call a tool on the Electron tool server
 */
export async function callTool(
  tool: string,
  params: Record<string, unknown>
): Promise<ToolResult> {
  // Create abort controller for timeout
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), TOOL_TIMEOUT_MS)

  try {
    const response = await fetch(`${ELECTRON_URL}/tool`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tool, params }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const text = await response.text()
      return {
        success: false,
        error: `Electron tool server error (${response.status}): ${text}`,
      }
    }

    return await response.json()
  } catch (err) {
    // Handle abort/timeout
    if (err instanceof Error && err.name === "AbortError") {
      return {
        success: false,
        error: `Tool '${tool}' timed out after ${TOOL_TIMEOUT_MS / 1000} seconds`,
      }
    }

    const message = err instanceof Error ? err.message : String(err)

    // Provide helpful error for connection failures
    if (message.includes("ECONNREFUSED")) {
      return {
        success: false,
        error:
          "Cannot connect to Electron app. Make sure the job-applicator app is running.",
      }
    }

    return {
      success: false,
      error: `Failed to call tool: ${message}`,
    }
  } finally {
    clearTimeout(timeoutId)
  }
}
