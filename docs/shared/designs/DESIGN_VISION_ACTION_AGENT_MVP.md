> Status: Active
> Owner: @jdubz
> Last Updated: 2025-12-12

# Vision/Action Agent MVP for Job Applicator

## Purpose
Replace brittle selector-based form filling in the Electron applicator with a minimal vision-driven loop that issues pixel-level actions via CDP. Goal is to reliably complete job application forms using only local CLI models (no external APIs) and a single screenshot in memory at any time.

## Scope
- **In scope:** One-step-at-a-time vision/action loop in `src/main.ts`, new IPC entry point (`agent-fill`), renderer log updates, small schema for actions.
- **Out of scope:** Feature flags, legacy selector fill path, MCP servers, multiple screenshots/history storage, remote API calls.

## Action Schema (CLI output)
```json
{
  "action": {
    "kind": "click" | "double_click" | "type" | "scroll" | "keypress" | "wait" | "done",
    "x": 0, "y": 0,          // required for click/double_click
    "text": "string",        // for type
    "dy": 400,                // for scroll (vertical)
    "dx": 0,                  // optional horizontal scroll
    "key": "Tab" | "Enter" | "Escape", // for keypress
    "ms": 800,                // for wait
    "reason": "why done"     // for done
  }
}
```

## Loop (max 12 steps per fill)
1. Capture single screenshot of BrowserView at ~1280px wide, JPEG quality ~60; compute a fast hash (e.g., sha1) for “no visual change” detection; discard previous image bytes after hashing.
2. Gather context: goal text, current URL, last 3 actions/outcomes, hash of previous screenshot.
3. Send context + screenshot to the local CLI provider (claude/codex/gemini wrapper) expecting the JSON schema above. If JSON parse fails, retry once with a hard stop.
4. Execute the returned action via CDP:
   - click/double_click → `Input.dispatchMouseEvent`
   - type → ensure focus is on an input/textarea/contenteditable; if not, send `Tab`; if still unfocused, send a gentle center click, then `Input.insertText`
   - scroll → `window.scrollBy(dx, dy)`
   - keypress → `Input.dispatchKeyEvent`
   - wait → `setTimeout`
5. Stop when action is `done`, when two consecutive hashes match (stuck), or when step cap reached.
6. Stream concise progress events to renderer (step number, action kind, result) for user visibility.

## Prompts (per step, minimal)
```
You automate a job application form.
Goal: <goal text>
URL: <url>
Recent actions: <n=3, with outcomes>
Previous screenshot hash: <hash>
Screenshot (base64 JPEG): <data:image/jpeg;base64,...>

Return exactly one JSON object matching the schema. Prefer click → type → Tab/Enter to submit. Use done when the form is submitted or you are blocked.
```

## Failure / Safety Rules
- Reject/ignore actions whose coordinates are outside the visible viewport bounds.
- If focused element is not form-capable, auto-send a Tab before typing; if still unfocused, single center click before typing.
- Per-loop timeout: 45s; per-action timeout: 3s. Abort with an error message on timeout.
- Detect “no progress” when two consecutive screenshot hashes match after an action; **do not run this check for pure wait actions**; treat N=2 consecutive non-wait no-change events as “stuck” and abort with a clear message.

## Telemetry (lightweight)
- Log per-step: action, result (`ok`/`blocked`), screenshot byte size, hash.
- Emit final summary: steps used, stop reason (done/limit/stuck/error), elapsed ms.

## Tasks to implement (actionable)
1) Add `capturePage` + hash helper in `src/main.ts` (single screenshot lifecycle).
2) Add `runVisionAgent(goal, provider)` loop implementing the steps above and CDP action executors.
3) Replace existing fill IPC with `agent-fill` that calls the loop and streams progress to renderer.
4) Update renderer `fill` button handler to invoke `agent-fill` and display streamed log/results (no legacy filler path).
5) Wire CLI prompt template and JSON parsing with one retry on parse failure; enforce 8-step cap and timeouts.
6) Add minimal tests: unit test for action schema parser and hash-based “no change” detection; integration happy-path behind `vitest --runInBand` using a fixture page.
