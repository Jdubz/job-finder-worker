> Status: Draft
> Owner: @jdubz
> Last Updated: 2025-12-09

# RFC: Job Applicator

Electron app that fills job application forms using AI.

## Problem

Job-finder discovers and matches jobs. Users still manually fill applications (~10 min each).

## Solution

1. User pastes job application URL
2. User navigates to form, handles login/captcha
3. User clicks "Fill Form"
4. App extracts form fields, sends to Claude CLI with user profile
5. App fills fields and uploads resume
6. User reviews and submits

## Architecture

```
+------------------------------------------------------+
|  Electron Window                                     |
|  +------------------------------------------------+  |
|  | Toolbar: [URL] [Go] [Claude v] [Fill Form]     |  |
|  +------------------------------------------------+  |
|  | BrowserView (job application page)             |  |
|  |                                                |  |
|  +------------------------------------------------+  |
+------------------------------------------------------+
        |                    |
        | HTTP               | CDP
        v                    v
+----------------+    +----------------+
| job-finder API |    | Playwright     |
| - profile      |    | - form fill    |
| - resume       |    | - file upload  |
+----------------+    +----------------+
```

## Implementation

### Files

```
job-applicator/
├── package.json
├── src/
│   ├── main.ts        # Electron app, Playwright, CLI runner
│   ├── preload.ts     # IPC bridge
│   └── renderer/
│       ├── index.html
│       └── app.ts     # Toolbar UI
```

### Main Process (src/main.ts)

Single file handles:
- Window creation with BrowserView
- Playwright CDP connection
- Form extraction (inject script into page)
- Claude CLI call for field mapping
- Fill execution

```typescript
// Pseudocode - actual implementation ~300 lines

import { app, BrowserWindow, BrowserView, ipcMain } from 'electron'
import { chromium } from 'playwright-core'
import { spawn } from 'child_process'

const CDP_PORT = process.env.CDP_PORT || '9222'
const API_URL = process.env.JOB_FINDER_API_URL || 'http://localhost:3000/api'

app.commandLine.appendSwitch('remote-debugging-port', CDP_PORT)

let browser, page

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1200, height: 800 })
  const view = new BrowserView()
  win.setBrowserView(view)

  browser = await chromium.connectOverCDP(`http://localhost:${CDP_PORT}`)
})

ipcMain.handle('fill-form', async () => {
  // 1. Get profile from job-finder backend
  const res = await fetch(`${API_URL}/config/personal-info`)
  if (!res.ok) throw new Error(`Failed to fetch profile: ${res.status}`)
  const profile = await res.json()

  // 2. Extract form fields
  const fields = await page.evaluate(EXTRACT_FORM_SCRIPT)

  // 3. Call selected CLI tool
  const provider = getSelectedProvider() // from dropdown
  const prompt = buildPrompt(fields, profile)
  const instructions = await runCli(provider, prompt)

  // 4. Fill fields
  for (const { selector, value } of instructions) {
    await page.fill(selector, value)
  }

  // 5. Upload resume to first file input (actual impl should match by label)
  const resumePath = await downloadResume(profile.resumeUrl)
  const fileInput = await page.$('input[type="file"]')
  if (fileInput) await fileInput.setInputFiles(resumePath)
})

type CliProvider = 'claude' | 'codex' | 'gemini'

// Reuse cli-runner pattern from job-finder-BE/server/src/modules/generator/workflow/services/cli-runner.ts
// Handles: timeouts, error classification, JSON parsing, stderr capture
function runCli(provider: CliProvider, prompt: string): Promise<FillInstruction[]> {
  const commands = {
    claude: ['claude', ['--print', '--output-format', 'json', prompt]],
    codex: ['codex', ['exec', '--json', '--skip-git-repo-check', '--', prompt]],
    gemini: ['gemini', ['-o', 'json', '--yolo', prompt]]
  }
  const [cmd, args] = commands[provider]

  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args)
    let stdout = '', stderr = ''
    const timeout = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error(`${provider} CLI timed out`))
    }, 60000)

    child.stdout.on('data', d => stdout += d)
    child.stderr.on('data', d => stderr += d)
    child.on('close', code => {
      clearTimeout(timeout)
      if (code === 0) {
        try {
          resolve(JSON.parse(stdout))
        } catch (e) {
          reject(new Error(`${provider} CLI returned invalid JSON: ${stdout.slice(0, 200)}${stdout.length > 200 ? '...' : ''}`))
        }
      } else {
        reject(new Error(`${provider} CLI failed (exit ${code}): ${stderr || stdout}`))
      }
    })
  })
}
```

### Form Extraction Script

Injected into page to get form structure. Extracts multiple identification attributes for robust field detection:

```javascript
const EXTRACT_FORM_SCRIPT = `
(() => {
  const inputs = document.querySelectorAll('input, select, textarea')
  return Array.from(inputs).map(el => {
    // Build selector: prefer id, then name, then data-testid
    const selector = el.id ? '#' + el.id
      : el.name ? '[name="' + el.name + '"]'
      : el.dataset.testid ? '[data-testid="' + el.dataset.testid + '"]'
      : null

    // Find label: check label[for], aria-label, aria-labelledby
    const forLabel = el.id && document.querySelector('label[for="' + el.id + '"]')
    const ariaLabel = el.getAttribute('aria-label')
    const ariaLabelledBy = el.getAttribute('aria-labelledby')
    const labelledByEl = ariaLabelledBy && document.getElementById(ariaLabelledBy)

    return {
      selector,
      type: el.type,
      label: forLabel?.textContent || ariaLabel || labelledByEl?.textContent || null,
      placeholder: el.placeholder || null,
      required: el.required
    }
  }).filter(f => f.selector)
})()
`
```

### Claude Prompt

```
Fill this job application form.

Profile:
- Name: John Doe
- Email: john@example.com
- Phone: 555-1234
- LinkedIn: linkedin.com/in/johndoe

Form fields:
[{ selector: "#email", type: "email", label: "Email" }, ...]

Return JSON array:
[{ "selector": "#email", "value": "john@example.com" }, ...]

Only fill fields you're confident about. Skip cover letter fields.
```

## Phases

### Phase 1: Working Prototype (3-4 days)
- Electron + BrowserView + Playwright connection
- Form extraction + Claude CLI + fill execution
- Hardcoded profile for testing

### Phase 2: Backend Integration (2 days)
- Fetch profile from job-finder API
- Download and upload resume file

### Phase 3: Polish (1-2 days)
- Error handling
- Loading states

**Total: ~7 days**

## Dependencies

- electron
- playwright-core
- One of: Claude CLI, Codex CLI, or Gemini CLI (user selects via dropdown)

## Monorepo Integration

### Workspace Setup

Add to root `package.json`:
```json
"workspaces": [
  "shared",
  "job-finder-BE/server",
  "job-finder-FE",
  "job-applicator"
]
```

### Files to Create

```
job-applicator/
├── package.json
├── tsconfig.json
├── eslint.config.js      # Copy from job-finder-FE, add node globals
├── .prettierrc.json      # Copy from job-finder-FE
├── vitest.config.ts      # Node environment for main process tests
└── src/
```

### CI Updates (`.github/workflows/pr-checks.yml`)

Add 3 jobs (run parallel with existing jobs):

```yaml
job-applicator-lint:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with: { node-version: '20', cache: 'npm' }
    - run: npm ci
    - run: npm run lint --workspace job-applicator

job-applicator-typecheck:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with: { node-version: '20', cache: 'npm' }
    - run: npm ci
    - run: npm run typecheck --workspace job-applicator

job-applicator-build:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with: { node-version: '20', cache: 'npm' }
    - run: npm ci
    - run: npm run build --workspace job-applicator
```

### Pre-commit Hooks (`.husky/pre-commit`)

Add:
```bash
npm run lint --workspace job-applicator
```

### Root Scripts (`package.json`)

Add:
```json
"build:applicator": "npm run build:shared && npm run build --workspace job-applicator",
"lint:applicator": "npm run lint --workspace job-applicator"
```

### Deployment

Runs locally in dev mode, connects to prod backend (also local). No packaging or distribution needed.

```bash
# Start the app
cd job-applicator
pnpm dev
```

Configure backend URL via environment:
```
JOB_FINDER_API_URL=http://localhost:3000/api
```

No changes to CI deploy workflows - this is a local dev tool.

## Open Questions

1. How to handle multi-page application forms? (defer to v2)
