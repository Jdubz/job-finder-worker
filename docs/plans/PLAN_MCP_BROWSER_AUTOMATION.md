# MCP Browser Automation Plan

> Status: Draft
> Owner: @Jdubz
> Last Updated: 2025-12-12

## Overview

Hard cutover from custom `<tool>` protocol to MCP server for browser automation.

**Constraint**: Must use Claude CLI (subscription account) - no direct API calls.

---

## Architecture

```
Claude CLI <--stdio/MCP--> MCP Server <--HTTP--> Electron <--CDP--> BrowserView
```

That's it. MCP server makes HTTP POST to Electron's tool server.

---

## Files to DELETE

| File | Lines | Reason |
|------|-------|--------|
| `src/agent-session.ts` | 352 | Replaced by MCP |
| `src/cli-config.ts` | 43 | No longer needed |

**Total: 395 lines removed**

---

## Files to CREATE

### MCP Server (`mcp-server/`)

```
mcp-server/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts        # Entry point, server setup
    ├── tools.ts        # Tool definitions
    └── electron-client.ts  # HTTP client to Electron
```

#### `mcp-server/src/tools.ts`

```typescript
import type { Tool } from "@modelcontextprotocol/sdk/types.js"

export const tools: Tool[] = [
  {
    name: "screenshot",
    description: "Capture the current page. Returns base64 image.",
    inputSchema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "click",
    description: "Click at coordinates.",
    inputSchema: {
      type: "object",
      properties: {
        x: { type: "number" },
        y: { type: "number" }
      },
      required: ["x", "y"]
    }
  },
  {
    name: "type",
    description: "Type text into focused element.",
    inputSchema: {
      type: "object",
      properties: { text: { type: "string" } },
      required: ["text"]
    }
  },
  {
    name: "press_key",
    description: "Press a key: Tab, Enter, Escape, Backspace, ArrowDown, ArrowUp",
    inputSchema: {
      type: "object",
      properties: { key: { type: "string" } },
      required: ["key"]
    }
  },
  {
    name: "scroll",
    description: "Scroll the page. Positive dy = down.",
    inputSchema: {
      type: "object",
      properties: { dy: { type: "number" } },
      required: ["dy"]
    }
  },
  {
    name: "get_form_fields",
    description: "Get all form fields with labels and values.",
    inputSchema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "generate_resume",
    description: "Generate tailored resume PDF.",
    inputSchema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "generate_cover_letter",
    description: "Generate cover letter PDF.",
    inputSchema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "upload_file",
    description: "Upload document to file input.",
    inputSchema: {
      type: "object",
      properties: { type: { type: "string", enum: ["resume", "coverLetter"] } },
      required: ["type"]
    }
  },
  {
    name: "done",
    description: "Signal form filling complete. DO NOT click submit.",
    inputSchema: {
      type: "object",
      properties: { summary: { type: "string" } },
      required: ["summary"]
    }
  }
]
```

#### `mcp-server/src/electron-client.ts`

```typescript
const ELECTRON_URL = process.env.JOB_APPLICATOR_URL || "http://localhost:19524"

export async function callTool(
  tool: string,
  params: Record<string, unknown>
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  const response = await fetch(`${ELECTRON_URL}/tool`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tool, params })
  })

  if (!response.ok) {
    throw new Error(`Electron tool server error: ${response.status}`)
  }

  return response.json()
}
```

#### `mcp-server/src/index.ts`

```typescript
import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { tools } from "./tools.js"
import { callTool } from "./electron-client.js"

const server = new Server(
  { name: "job-applicator", version: "1.0.0" },
  { capabilities: { tools: {} } }
)

server.setRequestHandler("tools/list", async () => ({ tools }))

server.setRequestHandler("tools/call", async (request) => {
  const { name, arguments: args } = request.params
  const result = await callTool(name, args || {})
  return {
    content: [{ type: "text", text: JSON.stringify(result) }]
  }
})

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch(console.error)
```

#### `mcp-server/package.json`

```json
{
  "name": "job-applicator-mcp",
  "version": "1.0.0",
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0"
  }
}
```

### Electron Tool Server (`src/tool-server.ts`)

```typescript
import * as http from "http"
import { executeTool } from "./tool-executor.js"
import { logger } from "./logger.js"

const PORT = 19524

export function startToolServer(): http.Server {
  const server = http.createServer(async (req, res) => {
    if (req.method !== "POST" || req.url !== "/tool") {
      res.writeHead(404)
      res.end()
      return
    }

    let body = ""
    req.on("data", chunk => body += chunk)
    req.on("end", async () => {
      try {
        const { tool, params } = JSON.parse(body)
        logger.info(`[ToolServer] ${tool}`)
        const result = await executeTool(tool, params)
        res.writeHead(200, { "Content-Type": "application/json" })
        res.end(JSON.stringify(result))
      } catch (err) {
        logger.error(`[ToolServer] Error:`, err)
        res.writeHead(500, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ success: false, error: String(err) }))
      }
    })
  })

  server.listen(PORT, "127.0.0.1")
  logger.info(`[ToolServer] Listening on http://127.0.0.1:${PORT}`)
  return server
}
```

---

## Files to MODIFY

### 1. `src/agent-tools.ts` → `src/tool-executor.ts`

Rename file. Remove coupling to agent-session. Export single function:

```typescript
export async function executeTool(
  tool: string,
  params: Record<string, unknown>
): Promise<{ success: boolean; data?: unknown; error?: string }>
```

Keep existing implementations for: screenshot, click, type, scroll, keypress, get_form_fields, generate_resume, generate_cover_letter, upload_file, done.

Add `press_key` aliases for ArrowDown, ArrowUp (extend existing keypress handler).

### 2. `src/main.ts`

**Remove:**
- Lines 68-70: Agent imports
- Lines 848-1015: All agent IPC handlers

**Add:**
```typescript
import { startToolServer } from "./tool-server.js"
import { setJobContext } from "./tool-executor.js"

// In app.whenReady():
startToolServer()

// New IPC handler:
ipcMain.handle("fill-form", async (_event, options: {
  jobMatchId: string
  profileText: string
  jobContext: string
}) => {
  setJobContext(options.jobMatchId)

  const prompt = `You are filling a job application form.

TOOLS: screenshot, click, type, press_key, scroll, get_form_fields, generate_resume, generate_cover_letter, upload_file, done

RULES:
1. screenshot first to see the page
2. Fill fields using profile data
3. For file uploads: generate_resume/generate_cover_letter, then upload_file
4. Call done when finished
5. DO NOT click submit

PROFILE:
${options.profileText}

JOB:
${options.jobContext}

Start with screenshot.`

  const claude = spawn("claude", ["--print", "--dangerously-skip-permissions", "-p", prompt])

  claude.stdout.on("data", (data) => {
    mainWindow?.webContents.send("agent-output", { text: data.toString() })
  })

  claude.stderr.on("data", (data) => {
    mainWindow?.webContents.send("agent-output", { text: data.toString(), isError: true })
  })

  claude.on("close", (code) => {
    mainWindow?.webContents.send("agent-status", { state: code === 0 ? "idle" : "stopped" })
  })

  return { success: true }
})
```

### 3. `src/preload.ts`

**Remove:**
- Lines 14-37: All agent-* methods (agentStartSession, agentStopSession, agentSendCommand, etc.)

**Replace with:**
```typescript
fillForm: (options: { jobMatchId: string; profileText: string; jobContext: string }) =>
  ipcRenderer.invoke("fill-form", options),
```

### 4. `src/renderer/app.ts`

Update fill form button handler to call new `fillForm` API instead of `agentStartSession` + `agentFillForm`.

### 5. `src/types.ts`

**Remove:**
- `AgentSessionState` type
- `AgentOutputData` interface
- `AgentStatusData` interface

---

## MCP Server Registration

One-time setup:

```bash
cd job-applicator/mcp-server
npm install
claude mcp add job-applicator --scope user -- node /path/to/job-applicator/mcp-server/index.js
```

---

## Summary

| Action | Files | Lines |
|--------|-------|-------|
| Delete | 2 | -395 |
| Create | 5 | ~200 |
| Modify | 5 | ~100 changed |

```
mcp-server/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts
    ├── tools.ts
    └── electron-client.ts

job-applicator/src/
├── tool-server.ts       (new)
├── tool-executor.ts     (renamed from agent-tools.ts)
├── main.ts              (modified)
├── preload.ts           (modified)
├── renderer/app.ts      (modified)
└── types.ts             (modified)
```

**Net: ~200 lines less code, proper separation of concerns.**
