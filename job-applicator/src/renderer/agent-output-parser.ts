/**
 * Agent Output Parser
 *
 * Parses Claude CLI output to extract tool calls and results,
 * providing user-friendly feedback about agent activity.
 */

export interface ParsedActivity {
  type: "tool_call" | "tool_result" | "thinking" | "text" | "error" | "completion"
  tool?: string
  params?: Record<string, unknown>
  result?: unknown
  text?: string
  icon?: string
  displayText: string
}

// Tool display configuration
const TOOL_DISPLAY: Record<string, { icon: string; verb: string }> = {
  screenshot: { icon: "📸", verb: "Taking screenshot" },
  click: { icon: "🖱️", verb: "Clicking" },
  type: { icon: "⌨️", verb: "Typing" },
  press_key: { icon: "⌨️", verb: "Pressing key" },
  scroll: { icon: "📜", verb: "Scrolling" },
  get_form_fields: { icon: "📋", verb: "Analyzing form fields" },
  generate_resume: { icon: "📄", verb: "Generating resume" },
  generate_cover_letter: { icon: "📝", verb: "Generating cover letter" },
  upload_file: { icon: "📤", verb: "Uploading file" },
  done: { icon: "✅", verb: "Completed" },
}

// Patterns for parsing CLI output
const PATTERNS = {
  // JSON tool call: {"type":"tool_use","name":"screenshot",...}
  toolUseJson: /\{"type"\s*:\s*"tool_use"[^}]*"name"\s*:\s*"([^"]+)"[^}]*\}/g,
  // Tool call line: [tool: screenshot]
  toolCallLine: /\[tool:\s*(\w+)\]/i,
  // Tool name in content: Using tool: screenshot
  usingTool: /using\s+(?:tool|mcp\s+tool):\s*(\w+)/i,
  // MCP tool call format
  mcpToolCall: /calling\s+(?:mcp\s+)?tool\s+['"]?(\w+)['"]?/i,
  // Tool result success
  toolSuccess: /tool\s+(?:result|output).*success/i,
  // Tool result error
  toolError: /tool\s+(?:result|output).*(?:error|failed)/i,
  // Done/completion
  completion: /(?:form\s+fill(?:ing)?\s+)?(?:completed?|finished|done)/i,
  // Screenshot taken
  screenshotTaken: /screenshot\s+(?:taken|captured)/i,
  // Clicking at coordinates
  clickingAt: /click(?:ing|ed)?\s+(?:at\s+)?\(?(\d+)\s*,\s*(\d+)\)?/i,
  // Typing text
  typingText: /typ(?:ing|ed?)\s+(?:text\s+)?['""]?([^'""]+)['""]?/i,
  // Analyzing/thinking
  analyzing: /(?:analyzing|examining|looking\s+at|checking|reviewing)/i,
}

/**
 * Parse a chunk of agent output text into structured activities
 */
export function parseAgentOutput(text: string): ParsedActivity[] {
  const activities: ParsedActivity[] = []
  const lines = text.split("\n")

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    const activity = parseLine(trimmed)
    if (activity) {
      activities.push(activity)
    }
  }

  // If no structured activities found, return as plain text
  if (activities.length === 0 && text.trim()) {
    activities.push({
      type: "text",
      displayText: text.trim(),
    })
  }

  return activities
}

/**
 * Parse a single line of output
 */
function parseLine(line: string): ParsedActivity | null {
  // Try to parse as JSON tool call
  try {
    if (line.includes('"type"') && line.includes('"tool_use"')) {
      const match = line.match(/\{[^{}]*"type"\s*:\s*"tool_use"[^{}]*\}/)
      if (match) {
        const json = JSON.parse(match[0])
        const toolName = json.name || "unknown"
        const display = TOOL_DISPLAY[toolName] || { icon: "🔧", verb: "Using" }
        return {
          type: "tool_call",
          tool: toolName,
          params: json.input,
          icon: display.icon,
          displayText: formatToolCall(toolName, json.input),
        }
      }
    }
  } catch {
    // Not valid JSON, continue with other patterns
  }

  // Check for tool call patterns
  let toolMatch = line.match(PATTERNS.toolCallLine)
    || line.match(PATTERNS.usingTool)
    || line.match(PATTERNS.mcpToolCall)

  if (toolMatch) {
    const toolName = toolMatch[1].toLowerCase()
    const display = TOOL_DISPLAY[toolName] || { icon: "🔧", verb: "Using" }
    return {
      type: "tool_call",
      tool: toolName,
      icon: display.icon,
      displayText: `${display.icon} ${display.verb}...`,
    }
  }

  // Check for completion
  if (PATTERNS.completion.test(line)) {
    return {
      type: "completion",
      icon: "✅",
      displayText: `✅ ${line}`,
    }
  }

  // Check for screenshot taken
  if (PATTERNS.screenshotTaken.test(line)) {
    return {
      type: "tool_result",
      tool: "screenshot",
      icon: "📸",
      displayText: "📸 Screenshot captured",
    }
  }

  // Check for click action
  const clickMatch = line.match(PATTERNS.clickingAt)
  if (clickMatch) {
    return {
      type: "tool_call",
      tool: "click",
      icon: "🖱️",
      displayText: `🖱️ Clicking at (${clickMatch[1]}, ${clickMatch[2]})`,
    }
  }

  // Check for typing
  const typeMatch = line.match(PATTERNS.typingText)
  if (typeMatch) {
    const text = typeMatch[1].length > 30 ? typeMatch[1].slice(0, 30) + "..." : typeMatch[1]
    return {
      type: "tool_call",
      tool: "type",
      icon: "⌨️",
      displayText: `⌨️ Typing "${text}"`,
    }
  }

  // Check for analyzing/thinking
  if (PATTERNS.analyzing.test(line)) {
    return {
      type: "thinking",
      icon: "🤔",
      displayText: `🤔 ${line}`,
    }
  }

  // Check for errors
  if (PATTERNS.toolError.test(line) || line.toLowerCase().includes("error")) {
    return {
      type: "error",
      icon: "❌",
      displayText: `❌ ${line}`,
    }
  }

  // Default: return as text if it looks meaningful
  if (line.length > 5) {
    return {
      type: "text",
      displayText: line,
    }
  }

  return null
}

/**
 * Format a tool call with parameters for display
 */
function formatToolCall(toolName: string, params?: Record<string, unknown>): string {
  const display = TOOL_DISPLAY[toolName] || { icon: "🔧", verb: "Using" }

  switch (toolName) {
    case "screenshot":
      return `${display.icon} Taking screenshot...`

    case "click":
      if (params?.x !== undefined && params?.y !== undefined) {
        return `${display.icon} Clicking at (${params.x}, ${params.y})`
      }
      return `${display.icon} Clicking...`

    case "type":
      if (params?.text) {
        const text = String(params.text)
        const preview = text.length > 30 ? text.slice(0, 30) + "..." : text
        return `${display.icon} Typing "${preview}"`
      }
      return `${display.icon} Typing...`

    case "press_key":
      if (params?.key) {
        return `${display.icon} Pressing ${params.key}`
      }
      return `${display.icon} Pressing key...`

    case "scroll":
      if (params?.dy !== undefined) {
        const direction = Number(params.dy) > 0 ? "down" : "up"
        return `${display.icon} Scrolling ${direction}`
      }
      return `${display.icon} Scrolling...`

    case "get_form_fields":
      return `${display.icon} Analyzing form fields...`

    case "generate_resume":
      return `${display.icon} Generating tailored resume...`

    case "generate_cover_letter":
      return `${display.icon} Generating cover letter...`

    case "upload_file":
      if (params?.type) {
        const fileType = params.type === "coverLetter" ? "cover letter" : "resume"
        return `${display.icon} Uploading ${fileType}...`
      }
      return `${display.icon} Uploading file...`

    case "done":
      if (params?.summary) {
        return `${display.icon} ${params.summary}`
      }
      return `${display.icon} Form filling completed`

    default:
      return `${display.icon} ${display.verb} ${toolName}...`
  }
}

/**
 * Create a streaming parser that accumulates partial output
 * and emits parsed activities as they become complete
 */
export class StreamingParser {
  private buffer: string = ""
  private lastToolCall: string | null = null

  /**
   * Add new text to the buffer and return any complete activities
   */
  addChunk(chunk: string): ParsedActivity[] {
    this.buffer += chunk
    const activities: ParsedActivity[] = []

    // Process complete lines
    const lines = this.buffer.split("\n")
    // Keep the last incomplete line in the buffer
    this.buffer = lines.pop() || ""

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue

      const activity = parseLine(trimmed)
      if (activity) {
        // Deduplicate consecutive tool calls
        if (activity.type === "tool_call" && activity.tool === this.lastToolCall) {
          continue
        }
        if (activity.type === "tool_call") {
          this.lastToolCall = activity.tool || null
        }
        activities.push(activity)
      }
    }

    return activities
  }

  /**
   * Flush any remaining buffered content
   */
  flush(): ParsedActivity[] {
    if (!this.buffer.trim()) return []
    const activities = parseAgentOutput(this.buffer)
    this.buffer = ""
    return activities
  }

  /**
   * Reset the parser state
   */
  reset(): void {
    this.buffer = ""
    this.lastToolCall = null
  }
}
