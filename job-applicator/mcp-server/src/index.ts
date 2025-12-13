#!/usr/bin/env node
/**
 * Job Applicator MCP Server
 *
 * Provides browser automation tools to Claude via the Model Context Protocol.
 * This server communicates with the Electron app's tool server over HTTP.
 *
 * Usage:
 *   Register with Claude CLI:
 *   claude mcp add job-applicator --scope user -- node /path/to/dist/index.js
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js"

import { tools } from "./tools.js"
import { callTool } from "./electron-client.js"

const server = new Server(
  {
    name: "job-applicator",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
)

/**
 * Handle tools/list request - return available tools
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools }
})

/**
 * Handle tools/call request - execute a tool
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params

  const result = await callTool(name, args || {})

  // MCP expects content array with text or image blocks
  if (result.success && result.data) {
    // Check if this is a screenshot response with image data
    const data = result.data as Record<string, unknown>
    if (data.image && typeof data.image === "string") {
      // Return image as base64
      const imageData = (data.image as string).replace(/^data:image\/\w+;base64,/, "")
      if (!imageData || imageData.trim().length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: "Empty image data from screenshot" }),
            },
          ],
          isError: true,
        }
      }
      return {
        content: [
          {
            type: "image" as const,
            data: imageData,
            mimeType: "image/jpeg",
          },
          {
            type: "text" as const,
            text: JSON.stringify({
              width: data.width,
              height: data.height,
              hash: data.hash,
            }),
          },
        ],
      }
    }

    // Return other data as JSON text
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(result.data),
        },
      ],
    }
  }

  // Return error
  if (!result.success) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ error: result.error }),
        },
      ],
      isError: true,
    }
  }

  // Return simple success
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ success: true }),
      },
    ],
  }
})

/**
 * Main entry point
 */
async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)

  // Log to stderr so it doesn't interfere with MCP protocol on stdout
  console.error("[job-applicator-mcp] Server started")
}

main().catch((error) => {
  console.error("[job-applicator-mcp] Fatal error:", error)
  process.exit(1)
})
