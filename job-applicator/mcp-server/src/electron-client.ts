/**
 * Electron Tool Server Client
 *
 * HTTP client that communicates with the Electron app's tool server.
 * The tool server exposes browser automation capabilities via a simple HTTP API.
 */

// Primary tool server URL provided by the Electron app; fall back to localhost if needed.
const ELECTRON_URL = process.env.JOB_APPLICATOR_URL || "http://127.0.0.1:19524"
const ELECTRON_URL_FALLBACK = "http://localhost:19524"

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
  // Small retry loop to tolerate brief port binding hiccups or AV/firewall blips.
  const targets = [ELECTRON_URL, ELECTRON_URL_FALLBACK].filter(
    (u, idx, arr) => !!u && arr.indexOf(u) === idx
  )
  const attempts = 3
  const backoffMs = 200

  for (let attempt = 1; attempt <= attempts; attempt++) {
    for (const baseUrl of targets) {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), TOOL_TIMEOUT_MS)
      const url = `${baseUrl}/tool`

      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tool, params }),
          signal: controller.signal,
        })

        if (!response.ok) {
          const text = await response.text()
          // Retry on 5xx (transient server errors), fail fast on 4xx.
          if (response.status >= 500 && attempt < attempts) {
            // eslint-disable-next-line no-console
            console.error(
              `[job-applicator-mcp] Tool server HTTP ${response.status} (attempt ${attempt}/${attempts}, url=${url})`
            )
            await new Promise((resolve) => setTimeout(resolve, backoffMs))
            continue
          }
          return {
            success: false,
            error: `Electron tool server error (${response.status}): ${text}`,
          }
        }

        return await response.json()
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)

        // Handle abort/timeout explicitly
        if (err instanceof Error && err.name === "AbortError") {
          return {
            success: false,
            error: `Tool '${tool}' timed out after ${TOOL_TIMEOUT_MS / 1000} seconds`,
          }
        }

        // Connection-level errors: retry
        if (
          message.includes("ECONNREFUSED") ||
          message.includes("ENOTFOUND") ||
          message.includes("EHOSTUNREACH") ||
          message.includes("ECONNRESET")
        ) {
          // eslint-disable-next-line no-console
          console.error(
            `[job-applicator-mcp] Tool server connection failed (attempt ${attempt}/${attempts}, url=${url}): ${message}`
          )
          if (attempt === attempts && baseUrl === targets[targets.length - 1]) {
            return {
              success: false,
              error:
                "Cannot connect to Electron tool server. Make sure the job-applicator app is running and the form page is open.",
            }
          }
          // brief backoff before next attempt
          await new Promise((resolve) => setTimeout(resolve, backoffMs))
          continue
        }

        return {
          success: false,
          error: `Failed to call tool: ${message}`,
        }
      } finally {
        clearTimeout(timeoutId)
      }
    }
  }

  return { success: false, error: "Failed to call tool (unknown error)" }
}
