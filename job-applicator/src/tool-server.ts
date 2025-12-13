/**
 * Tool Server
 *
 * HTTP server that exposes browser automation tools to the MCP server.
 * Listens on localhost only for security.
 */

import * as http from "http"
import { executeTool } from "./tool-executor.js"
import { logger } from "./logger.js"

// Port can be overridden for testing to avoid conflicts with running app
let PORT = parseInt(process.env.TOOL_SERVER_PORT || "19524", 10)
const HOST = "127.0.0.1"

let server: http.Server | null = null
let requestCounter = 0

/**
 * Set the port (used by tests to avoid conflicts)
 */
export function setToolServerPort(port: number): void {
  if (server) {
    throw new Error("Cannot change port while server is running")
  }
  PORT = port
}
let statusCallback: ((message: string) => void) | null = null

/**
 * Set a callback to receive tool execution status updates
 */
export function setToolStatusCallback(callback: ((message: string) => void) | null): void {
  statusCallback = callback
}

/**
 * Send a status update to the callback if set
 */
function sendStatus(message: string): void {
  if (statusCallback) {
    statusCallback(message)
  }
}

/**
 * Format tool result for display
 */
function formatToolResult(tool: string, params: Record<string, unknown> | undefined, data: unknown): string {
  try {
    switch (tool) {
      case "get_user_profile":
        return "loaded profile"
      case "get_form_fields": {
        const fields = data as { fields?: unknown[] } | undefined
        return `found ${fields?.fields?.length || 0} fields`
      }
      case "fill_field":
        return `"${params?.selector || "?"}" = "${String(params?.value || "").slice(0, 30)}"`
      case "select_option":
        return `"${params?.selector || "?"}" = "${params?.value || "?"}"`
      case "select_combobox":
        return `"${params?.selector || "?"}" → "${params?.value || "?"}"`
      case "set_checkbox":
        return `"${params?.selector || "?"}" = ${params?.checked}`
      case "click_element":
        return `clicked "${params?.selector || "?"}"`
      case "click":
        return `at (${params?.x ?? "?"}, ${params?.y ?? "?"})`
      case "type":
        return `"${String(params?.text || "").slice(0, 30)}"`
      case "scroll":
        return `${params?.dy ?? 0}px`
      case "screenshot":
        return "captured"
      case "get_buttons": {
        const buttons = data as { buttons?: unknown[] } | undefined
        return `found ${buttons?.buttons?.length || 0} buttons`
      }
      case "get_page_info":
        return "loaded"
      case "get_job_context":
        return "loaded"
      case "done":
        return String(params?.summary || "complete")
      default:
        return "done"
    }
  } catch {
    return "done"
  }
}

/**
 * Start the tool server
 */
export function startToolServer(): http.Server {
  if (server) {
    logger.warn("[ToolServer] Server already running")
    return server
  }

  server = http.createServer(async (req, res) => {
    // Track each request for debugging
    const reqId = ++requestCounter
    const socket = req.socket
    const remoteInfo = `${socket.remoteAddress}:${socket.remotePort}`
    const userAgent = req.headers["user-agent"] || "none"
    const contentLength = req.headers["content-length"] || "unknown"
    logger.info(`[ToolServer] #${reqId} ${req.method} ${req.url} from ${remoteInfo} (UA: ${userAgent}, CL: ${contentLength})`)

    // CORS headers for local development
    res.setHeader("Access-Control-Allow-Origin", "*")
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS")
    res.setHeader("Access-Control-Allow-Headers", "Content-Type")

    // Handle preflight
    if (req.method === "OPTIONS") {
      res.writeHead(204)
      res.end()
      return
    }

    // Only accept POST to /tool
    if (req.method !== "POST" || req.url !== "/tool") {
      res.writeHead(404, { "Content-Type": "application/json" })
      res.end(JSON.stringify({ success: false, error: "Not found" }))
      return
    }

    // Parse request body
    let body = ""
    req.on("data", (chunk) => {
      body += chunk
      // Prevent body size attacks
      if (body.length > 1024 * 1024) {
        res.writeHead(413, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ success: false, error: "Request too large" }))
        req.destroy()
      }
    })

    req.on("end", async () => {
      try {
        // Log raw body for debugging malformed requests
        if (!body || body.trim().length === 0) {
          logger.warn(`[ToolServer] Empty request body received`)
          res.writeHead(400, { "Content-Type": "application/json" })
          res.end(JSON.stringify({ success: false, error: "Empty request body" }))
          return
        }

        let parsed: { tool?: unknown; params?: unknown }
        try {
          parsed = JSON.parse(body)
        } catch (parseErr) {
          // Log full details for debugging malformed requests
          logger.error(`[ToolServer] #${reqId} JSON parse error. Full body: "${body}"`)
          logger.error(`[ToolServer] #${reqId} Request from ${remoteInfo}, headers: ${JSON.stringify(req.headers)}`)
          throw parseErr
        }

        const { tool, params } = parsed

        if (!tool || typeof tool !== "string") {
          res.writeHead(400, { "Content-Type": "application/json" })
          res.end(JSON.stringify({ success: false, error: "Missing tool name" }))
          return
        }

        // Log tool call with parameters for debugging
        const paramsStr = params ? JSON.stringify(params).slice(0, 500) : "{}"
        logger.info(`[ToolServer] #${reqId} Executing: ${tool}(${paramsStr})`)
        sendStatus(`🔧 ${tool}...`)
        const startTime = Date.now()

        const result = await executeTool(tool, (params || {}) as Record<string, unknown>)

        const duration = Date.now() - startTime
        logger.info(`[ToolServer] #${reqId} ${tool} completed in ${duration}ms (success=${result.success})`)

        // Send completion status with result summary
        if (result.success) {
          const summary = formatToolResult(tool, params as Record<string, unknown>, result.data)
          sendStatus(`✓ ${tool}: ${summary}`)
        } else {
          sendStatus(`✗ ${tool}: ${result.error || "failed"}`)
        }

        res.writeHead(200, { "Content-Type": "application/json" })
        res.end(JSON.stringify(result))
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        logger.error(`[ToolServer] Error: ${message}`)
        res.writeHead(500, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ success: false, error: message }))
      }
    })

    req.on("error", (err) => {
      logger.error(`[ToolServer] Request error: ${err.message}`)
    })
  })

  server.on("error", (err) => {
    logger.error(`[ToolServer] Server error: ${err.message}`)
  })

  server.listen(PORT, HOST, () => {
    logger.info(`[ToolServer] Listening on http://${HOST}:${PORT}`)
  })

  return server
}

/**
 * Stop the tool server
 */
export function stopToolServer(): Promise<void> {
  return new Promise((resolve) => {
    if (!server) {
      resolve()
      return
    }

    server.close(() => {
      logger.info("[ToolServer] Stopped")
      server = null
      resolve()
    })
  })
}
