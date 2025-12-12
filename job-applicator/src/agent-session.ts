/**
 * Agent Session Manager
 *
 * Manages a persistent CLI session for the form-filling agent.
 * Uses child_process.spawn with stdio pipes for cross-platform compatibility.
 */

import { spawn, ChildProcess } from "child_process"
import { EventEmitter } from "events"
import { logger } from "./logger.js"
import { getCliCommand } from "./cli-config.js"

// ============================================================================
// Types
// ============================================================================

export type AgentSessionState = "idle" | "working" | "stopped"

export interface ToolCall {
  name: string
  params?: Record<string, unknown>
}

export interface ToolResult {
  success: boolean
  data?: unknown
  error?: string
}

export interface AgentSessionConfig {
  provider?: "claude" | "codex" | "gemini"
  profileText: string
}

// ============================================================================
// AgentSession Class
// ============================================================================

export class AgentSession extends EventEmitter {
  private process: ChildProcess | null = null
  private state: AgentSessionState = "stopped"
  private buffer: string = ""
  private profileText: string = ""
  private currentJobContext: string = ""

  // Tool protocol delimiters
  private readonly TOOL_START = "<tool>"
  private readonly TOOL_END = "</tool>"

  constructor() {
    super()
  }

  getState(): AgentSessionState {
    return this.state
  }

  /**
   * Start a new agent session
   */
  async start(config: AgentSessionConfig): Promise<void> {
    if (this.process) {
      await this.stop()
    }

    this.profileText = config.profileText
    const provider = config.provider || "claude"

    logger.info(`[AgentSession] Starting session with provider: ${provider}`)

    const [cmd, args] = getCliCommand(provider)

    this.process = spawn(cmd, args, {
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
    })

    if (!this.process.stdout || !this.process.stdin) {
      throw new Error("Failed to create stdio pipes")
    }

    // Handle stdout
    this.process.stdout.on("data", (data: Buffer) => {
      const text = data.toString()
      this.handleOutput(text)
    })

    // Handle stderr
    this.process.stderr?.on("data", (data: Buffer) => {
      const text = data.toString()
      logger.warn(`[AgentSession] stderr: ${text}`)
      this.emit("output", { text, isError: true })
    })

    // Handle process exit
    this.process.on("exit", (code, signal) => {
      logger.info(`[AgentSession] Process exited: code=${code}, signal=${signal}`)
      this.state = "stopped"
      this.emit("state-change", this.state)
      this.process = null
    })

    // Handle process error
    this.process.on("error", (err) => {
      logger.error(`[AgentSession] Process error: ${err.message}`)
      this.emit("error", err)
      this.state = "stopped"
      this.emit("state-change", this.state)
    })

    // Set state to idle
    this.state = "idle"
    this.emit("state-change", this.state)

    // Inject system prompt
    await this.injectSystemPrompt()

    logger.info("[AgentSession] Session started successfully")
  }

  /**
   * Stop the agent session
   */
  async stop(): Promise<void> {
    if (this.process) {
      logger.info("[AgentSession] Stopping session...")

      // Close stdin to signal EOF
      this.process.stdin?.end()

      // Give it a moment to exit gracefully
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          if (this.process) {
            this.process.kill("SIGTERM")
          }
          resolve()
        }, 1000)

        this.process?.once("exit", () => {
          clearTimeout(timeout)
          resolve()
        })
      })

      this.process = null
    }

    this.state = "stopped"
    this.buffer = ""
    this.emit("state-change", this.state)
    logger.info("[AgentSession] Session stopped")
  }

  /**
   * Send a command/message to the agent
   */
  sendCommand(command: string): void {
    if (!this.process?.stdin || this.state === "stopped") {
      throw new Error("Agent session not running")
    }

    this.state = "working"
    this.emit("state-change", this.state)

    // Write command to stdin
    this.process.stdin.write(command + "\n")
    logger.info(`[AgentSession] Sent command: ${command.slice(0, 100)}${command.length > 100 ? "..." : ""}`)
  }

  /**
   * Send a tool result back to the agent
   */
  sendToolResult(result: ToolResult): void {
    if (!this.process?.stdin) {
      logger.warn("[AgentSession] Cannot send tool result - process not running")
      return
    }

    const resultJson = JSON.stringify(result)
    const message = `<result>${resultJson}</result>\n`
    this.process.stdin.write(message)
    logger.info(`[AgentSession] Sent tool result: success=${result.success}`)
  }

  /**
   * Update the current job context
   */
  setJobContext(context: string): void {
    this.currentJobContext = context
    logger.info(`[AgentSession] Job context updated (${context.length} chars)`)
  }

  /**
   * Inject the system prompt into the session
   */
  private async injectSystemPrompt(): Promise<void> {
    const systemPrompt = this.buildSystemPrompt()
    this.process?.stdin?.write(systemPrompt + "\n")
    logger.info("[AgentSession] System prompt injected")
  }

  /**
   * Build the system prompt with tool definitions
   */
  private buildSystemPrompt(): string {
    return `You are a job application form filler assistant. You help fill out job application forms using the user's profile data. You have access to tools that let you see and interact with web pages.

AVAILABLE TOOLS:
- screenshot: Request current page view (call when you need to see the page)
- get_form_fields: Get structured list of form inputs with labels
- get_page_info: Get current URL and page title
- click: Click at coordinates on the page. Params: {"x": number, "y": number}
- type: Type text into the currently focused field. Params: {"text": "string"}
- scroll: Scroll the page. Params: {"dy": number, "dx"?: number} (dy: positive = down, dx: positive = right)
- keypress: Press a key. Params: {"key": "Tab" | "Enter" | "Escape" | "Backspace" | "SelectAll"}
- generate_resume: Generate a tailored resume. Params: {} (uses current job context automatically)
- generate_cover_letter: Generate a cover letter. Params: {} (uses current job context automatically)
- upload_file: Upload a document to file input. Params: {"type": "resume" | "coverLetter"} (uses last generated doc)
- done: Signal that form filling is complete. Params: {"summary": "what was filled"}

RULES:
1. Start by requesting a screenshot to see the current page state
2. Use get_form_fields to understand form structure when helpful
3. Fill fields using the user's profile data - be accurate
4. If the form has file upload fields, generate and upload documents
5. DO NOT click submit buttons - call done() when form is filled
6. If you encounter an error, try an alternative approach
7. Call done() with a summary of what was filled

Call tools using this exact format: <tool>{"name": "tool_name", "params": {...}}</tool>

USER PROFILE:
${this.profileText}

CURRENT JOB:
${this.currentJobContext || "(No job selected yet - wait for fill command)"}

When you understand these instructions, respond with "Ready." and wait for commands.`
  }

  // Maximum buffer size (100KB) - prevents memory exhaustion on long sessions
  private readonly MAX_BUFFER_SIZE = 100000

  /**
   * Handle output from the CLI process
   */
  private handleOutput(text: string): void {
    this.buffer += text

    // Cap buffer at MAX_BUFFER_SIZE to prevent memory exhaustion
    if (this.buffer.length > this.MAX_BUFFER_SIZE) {
      // Keep the last half to preserve any partial tool calls
      this.buffer = this.buffer.slice(-this.MAX_BUFFER_SIZE / 2)
      logger.warn(`[AgentSession] Buffer exceeded ${this.MAX_BUFFER_SIZE} chars, truncated`)
    }

    this.emit("output", { text, isError: false })

    // Parse any complete tool calls from buffer
    this.parseToolCalls()
  }

  /**
   * Parse tool calls from the output buffer
   */
  private parseToolCalls(): void {
    let startIdx = this.buffer.indexOf(this.TOOL_START)

    while (startIdx !== -1) {
      const endIdx = this.buffer.indexOf(this.TOOL_END, startIdx)

      if (endIdx === -1) {
        // Incomplete tool call - wait for more data
        break
      }

      // Extract the JSON between delimiters
      const toolJson = this.buffer.substring(
        startIdx + this.TOOL_START.length,
        endIdx
      )

      // Remove the parsed tool call from buffer
      this.buffer = this.buffer.substring(endIdx + this.TOOL_END.length)

      try {
        const parsed = JSON.parse(toolJson)
        const toolCall: ToolCall = {
          name: parsed.name,
          params: parsed.params || parsed,
        }

        // Remove 'name' from params if it was included
        if (toolCall.params && "name" in toolCall.params) {
          const { name: _, ...rest } = toolCall.params as Record<string, unknown>
          toolCall.params = rest
        }

        logger.info(`[AgentSession] Tool call parsed: ${toolCall.name}`)
        this.emit("tool-call", toolCall)
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        logger.error(`[AgentSession] Failed to parse tool call JSON: ${errorMsg}`)
        logger.error(`[AgentSession] Raw JSON: ${toolJson}`)
        this.emit("error", new Error(`Invalid tool call JSON: ${toolJson}`))
      }

      // Look for next tool call
      startIdx = this.buffer.indexOf(this.TOOL_START)
    }

    // Check if agent signaled done (state transition)
    if (this.buffer.includes('"name":"done"') || this.buffer.includes('"name": "done"')) {
      this.state = "idle"
      this.emit("state-change", this.state)
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let agentSession: AgentSession | null = null

export function getAgentSession(): AgentSession {
  if (!agentSession) {
    agentSession = new AgentSession()
  }
  return agentSession
}

export function resetAgentSession(): void {
  if (agentSession) {
    agentSession.stop()
    agentSession = null
  }
}
