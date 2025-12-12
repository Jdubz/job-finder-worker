> Status: Draft
> Owner: @jdubz
> Last Updated: 2025-12-12

# Design: Persistent Agent Session Architecture

## Overview

Replace the current one-shot CLI invocation model with a persistent agent session that maintains context across multiple form fills. The agent runs as a continuous PTY session, exposing tools that it can call on-demand (MCP-style), enabling efficient multi-step workflows without repeated context loading.

## Problem Statement

The current vision agent implementation has critical inefficiencies:

1. **CLI spawn overhead**: New process spawned for every single action
2. **Context duplication**: Full profile + screenshot sent with every request
3. **No memory**: Model loses context between actions, can't learn from mistakes
4. **Slow iteration**: 45s timeout per action, ~5-10 seconds actual latency each

Users expect an experience similar to OpenAI Operator or Claude Computer Use - a single persistent session where the agent maintains state and responds quickly.

## Goals

- Single CLI process for entire user session (not per-action)
- Agent requests screenshots on-demand (not pushed every action)
- Context (profile, job data) loaded once at session start
- User can send custom commands to agent
- Agent can trigger document generation when needed
- Human-in-the-loop: agent fills forms, user reviews and submits

## Non-Goals

- Fully autonomous job application (no auto-submit)
- Multi-job batch processing (one job at a time)
- API-based implementation (must use CLI for subscription account)

## Architecture

### System Diagram

```
+------------------------------------------------------------------+
|                        ELECTRON APP                               |
+------------------------------------------------------------------+
|                                                                   |
|  +------------------------------------------------------------+  |
|  |                     MAIN PROCESS                            |  |
|  |                                                             |  |
|  |  +------------------+     +-----------------------------+   |  |
|  |  | AgentController  |     | Tool Handlers               |   |  |
|  |  |                  |     |                             |   |  |
|  |  | - PTY management |     | screenshot()                |   |  |
|  |  | - Tool parsing   |<--->| get_form_fields()           |   |  |
|  |  | - Context mgmt   |     | click(x, y)                 |   |  |
|  |  | - State machine  |     | type(text)                  |   |  |
|  |  +--------+---------+     | scroll(dy)                  |   |  |
|  |           |               | keypress(key)               |   |  |
|  |           | stdin/stdout  | generate_resume()           |   |  |
|  |           v               | generate_cover_letter()     |   |  |
|  |  +------------------+     | upload_file(type)           |   |  |
|  |  | Claude CLI       |     | done(summary)               |   |  |
|  |  | (node-pty)       |     +-----------------------------+   |  |
|  |  | Persistent       |                                       |  |
|  |  | Session          |                                       |  |
|  |  +------------------+                                       |  |
|  +------------------------------------------------------------+  |
|                              | IPC                                |
|                              v                                    |
|  +------------------------------------------------------------+  |
|  |                    RENDERER PROCESS                         |  |
|  |                                                             |  |
|  |  +---------------------+  +-----------------------------+   |  |
|  |  |    BrowserView      |  |    Agent Panel              |   |  |
|  |  |   (job application) |  |                             |   |  |
|  |  |                     |  |  - Conversation display     |   |  |
|  |  |                     |  |  - Streaming output         |   |  |
|  |  |                     |  |  - Tool call visualization  |   |  |
|  |  |                     |  |  - Custom command input     |   |  |
|  |  |                     |  |  - Status indicators        |   |  |
|  |  +---------------------+  +-----------------------------+   |  |
|  +------------------------------------------------------------+  |
+------------------------------------------------------------------+
```

### Session Lifecycle

```
1. APP LAUNCHES
   - Fetch profile from backend
   - Fetch job matches from backend
   - Agent NOT running yet

2. USER CLICKS "Start Session"
   - Spawn persistent claude PTY session
   - Inject system prompt with tool definitions
   - Inject profile + job queue summary into context
   - Agent enters IDLE state, waiting for commands

3. USER BROWSES
   - Selects job from sidebar
   - Navigates to application page manually
   - Agent observes URL changes but doesn't act

4. USER CLICKS "Fill Form"
   - Sends "Fill this application form" command to agent
   - Agent requests screenshot (via tool call)
   - Agent analyzes form, fills fields iteratively
   - Agent generates documents if file uploads detected
   - Agent uploads documents to file inputs
   - Agent returns: "Done. Ready for review."

5. USER REVIEWS & SUBMITS
   - User can send custom commands: "Change phone to 555-1234"
   - User manually clicks submit button
   - User can mark job as applied

6. REPEAT (agent session persists)
   - Select next job, navigate to form
   - Click "Fill Form" again
   - Agent has full context from previous interactions
```

### Tool Protocol

Agent communicates via delimited tool calls in stdout:

**Tool Request (Agent -> App):**
```
<tool>{"name": "screenshot"}</tool>
<tool>{"name": "click", "x": 450, "y": 320}</tool>
<tool>{"name": "type", "text": "john.doe@email.com"}</tool>
<tool>{"name": "generate_resume"}</tool>
```

**Tool Result (App -> Agent):**
```
<result>{"success": true, "image": "base64..."}</result>
<result>{"success": true}</result>
<result>{"success": false, "error": "Element not focused"}</result>
```

### Tool Definitions

| Tool | Parameters | Returns | Description |
|------|------------|---------|-------------|
| `screenshot` | none | `{image: base64}` | Capture current BrowserView state |
| `get_form_fields` | none | `{fields: FormField[]}` | DOM analysis of form inputs |
| `get_page_info` | none | `{url, title}` | Current page metadata |
| `click` | `{x, y}` | `{success}` | Click at coordinates (scaled from 1280px) |
| `type` | `{text}` | `{success}` | Type text into focused element |
| `scroll` | `{dy}` | `{success}` | Scroll page vertically |
| `keypress` | `{key}` | `{success}` | Press Tab/Enter/Escape/Backspace/SelectAll |
| `generate_resume` | none | `{status, url?}` | Trigger resume generation for current job |
| `generate_cover_letter` | none | `{status, url?}` | Trigger cover letter generation |
| `upload_file` | `{type}` | `{success}` | Upload resume or coverLetter to file input |
| `done` | `{summary}` | none | Signal form fill complete |

### System Prompt

```
You are a job application form filler assistant. You help fill out job
application forms using the user's profile data. You have access to tools
that let you see and interact with web pages.

LOADED CONTEXT:
- User profile with personal info, work history, education, skills
- Current job details (title, company, description, requirements)

AVAILABLE TOOLS:
- screenshot: Request current page view (call when you need to see the page)
- get_form_fields: Get structured list of form inputs with labels
- click(x, y): Click at coordinates on the page
- type(text): Type text into the currently focused field
- scroll(dy): Scroll the page (positive = down, negative = up)
- keypress(key): Press Tab, Enter, Escape, Backspace, or SelectAll
- generate_resume: Generate a tailored resume (if form requires file upload)
- generate_cover_letter: Generate a cover letter (if form requires)
- upload_file(type): Upload 'resume' or 'coverLetter' to file input
- done(summary): Call when form is completely filled

RULES:
1. Start by requesting a screenshot to see the current page state
2. Use get_form_fields to understand form structure when helpful
3. Fill fields using the user's profile data - be accurate
4. If the form has file upload fields, generate and upload documents
5. DO NOT click submit buttons - call done() when form is filled
6. If you encounter an error, try an alternative approach
7. Call done() with a summary of what was filled

Call tools using: <tool>{"name": "...", "param": "value"}</tool>

USER PROFILE:
{profileText}

CURRENT JOB:
{jobTitle} at {companyName}
{jobDescription}
```

## Implementation Plan

### Phase 1: Core Infrastructure

1. **Add node-pty dependency**
   ```bash
   npm install node-pty --save
   ```

2. **Create AgentController class** (`src/agent-controller.ts`)
   - PTY session management (spawn, kill, restart)
   - Tool call parsing from stdout stream
   - Tool result injection to stdin
   - State machine (idle, working, stopped)
   - Event emitter for UI updates

3. **Implement tool handlers** (`src/agent-tools.ts`)
   - Wire existing functions (capturePage, executeAction, etc.)
   - Add get_form_fields (DOM analysis via executeJavaScript)
   - Add document generation triggers
   - Add file upload handler

### Phase 2: IPC Integration

4. **Add IPC handlers for agent control**
   - `agent-start-session`: Spawn PTY, inject context
   - `agent-stop-session`: Kill PTY gracefully
   - `agent-send-command`: Send user command to agent
   - `agent-fill-form`: Send "fill this form" command

5. **Add IPC events for agent output**
   - `agent-output`: Stream agent text output
   - `agent-tool-call`: Notify UI of tool execution
   - `agent-status`: Session state changes

### Phase 3: Renderer UI

6. **Add Agent Panel component**
   - Streaming conversation display
   - Tool call visualization (icon + params + result)
   - Custom command input field
   - Status indicator (idle/working/stopped)

7. **Update toolbar**
   - "Start Session" / "Stop Session" toggle
   - "Fill Form" button (enabled when session active)
   - Session status indicator

### Phase 4: Polish

8. **Error handling**
   - PTY crash recovery
   - Tool execution timeout
   - Graceful degradation

9. **Context management**
   - Re-inject job details when user selects new job
   - Notify agent of URL changes

## File Changes

### New Files
- `src/agent-controller.ts` - PTY session management
- `src/agent-tools.ts` - Tool handler implementations
- `src/renderer/agent-panel.ts` - Agent UI component

### Modified Files
- `src/main.ts` - IPC handlers for agent control
- `src/preload.ts` - Expose agent IPC to renderer
- `src/renderer/app.ts` - Integrate agent panel
- `src/renderer/index.html` - Agent panel markup
- `src/renderer/styles.css` - Agent panel styles
- `package.json` - Add node-pty dependency

## Dependencies

- `node-pty` - Native PTY bindings for Node.js
  - Required for persistent interactive CLI sessions
  - Cross-platform (Windows, macOS, Linux)
  - Electron-compatible

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| node-pty native module issues | Use electron-rebuild, test on all platforms |
| Claude CLI output parsing fragile | Use clear delimiters, robust regex, fallback handling |
| PTY session crashes | Auto-restart with state recovery |
| Tool execution hangs | Per-tool timeout with cancellation |
| Context window overflow | Truncate old conversation, keep recent + system prompt |

## Success Metrics

- Single CLI spawn per session (vs. per-action)
- Form fill time reduced by 80%+ (no repeated context loading)
- User can complete full session without restarts
- Agent successfully fills 90%+ of standard form fields

## Open Questions

1. How to handle multi-page application forms? (navigate + re-analyze)
2. Should agent auto-detect when form is complete vs explicit done()?
3. How to handle CAPTCHA or other blocking elements?
4. Should we persist session across app restarts?

## References

- [node-pty GitHub](https://github.com/microsoft/node-pty)
- [NLUX - Conversational UI library](https://docs.nlkit.com/nlux)
- [assistant-ui](https://github.com/assistant-ui/assistant-ui)
- [Claude CLI documentation](https://docs.anthropic.com/en/docs/claude-cli)
