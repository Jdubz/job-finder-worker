/**
 * Tool Server
 *
 * HTTP server that exposes browser automation tools to the MCP server.
 * Listens on localhost only for security.
 */

import * as http from "http"
import { executeTool } from "./tool-executor.js"
import { logger } from "./logger.js"

const PORT = 19524
const HOST = "127.0.0.1"

let server: http.Server | null = null

/**
 * Start the tool server
 */
export function startToolServer(): http.Server {
  if (server) {
    logger.warn("[ToolServer] Server already running")
    return server
  }

  server = http.createServer(async (req, res) => {
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
        const { tool, params } = JSON.parse(body)

        if (!tool || typeof tool !== "string") {
          res.writeHead(400, { "Content-Type": "application/json" })
          res.end(JSON.stringify({ success: false, error: "Missing tool name" }))
          return
        }

        logger.info(`[ToolServer] Executing: ${tool}`)
        const startTime = Date.now()

        const result = await executeTool(tool, params || {})

        const duration = Date.now() - startTime
        logger.info(`[ToolServer] ${tool} completed in ${duration}ms (success=${result.success})`)

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
