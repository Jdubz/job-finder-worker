import { app, BrowserWindow, BrowserView, ipcMain, IpcMainInvokeEvent } from "electron"
import { chromium, Browser, Page } from "playwright-core"
import { spawn } from "child_process"
import * as path from "path"
import * as fs from "fs"
import * as os from "os"

// Configuration from environment
const CDP_PORT = process.env.CDP_PORT || "9222"
const API_URL = process.env.JOB_FINDER_API_URL || "http://localhost:3000/api"

// Enable remote debugging for Playwright CDP connection
app.commandLine.appendSwitch("remote-debugging-port", CDP_PORT)

// Global state
let mainWindow: BrowserWindow | null = null
let browserView: BrowserView | null = null
let playwrightBrowser: Browser | null = null
let playwrightPage: Page | null = null

// CLI provider types
type CliProvider = "claude" | "codex" | "gemini"

interface FillInstruction {
  selector: string
  value: string
}

interface FormField {
  selector: string | null
  type: string
  label: string | null
  placeholder: string | null
  required: boolean
}

interface PersonalInfo {
  name: string
  email: string
  phone?: string
  location?: string
  website?: string
  github?: string
  linkedin?: string
}

// Form extraction script - injected into page
const EXTRACT_FORM_SCRIPT = `
(() => {
  const inputs = document.querySelectorAll('input, select, textarea')
  return Array.from(inputs).map(el => {
    // Build selector: prefer id, then name, then data-testid
    const selector = el.id ? '#' + CSS.escape(el.id)
      : el.name ? '[name="' + CSS.escape(el.name) + '"]'
      : el.dataset.testid ? '[data-testid="' + CSS.escape(el.dataset.testid) + '"]'
      : null

    // Find label: check label[for], aria-label, aria-labelledby
    const forLabel = el.id && document.querySelector('label[for="' + CSS.escape(el.id) + '"]')
    const ariaLabel = el.getAttribute('aria-label')
    const ariaLabelledBy = el.getAttribute('aria-labelledby')
    const labelledByEl = ariaLabelledBy && document.getElementById(ariaLabelledBy)

    return {
      selector,
      type: el.type || el.tagName.toLowerCase(),
      label: forLabel?.textContent?.trim() || ariaLabel || labelledByEl?.textContent?.trim() || null,
      placeholder: el.placeholder || null,
      required: el.required || false
    }
  }).filter(f => f.selector && f.type !== 'hidden' && f.type !== 'submit' && f.type !== 'button')
})()
`

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(import.meta.dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // Create BrowserView for job application pages
  browserView = new BrowserView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.setBrowserView(browserView)

  // Position BrowserView below toolbar (toolbar height ~60px)
  const TOOLBAR_HEIGHT = 60
  const bounds = mainWindow.getBounds()
  browserView.setBounds({
    x: 0,
    y: TOOLBAR_HEIGHT,
    width: bounds.width,
    height: bounds.height - TOOLBAR_HEIGHT,
  })
  browserView.setAutoResize({ width: true, height: true })

  // Load the renderer UI (toolbar)
  await mainWindow.loadFile(path.join(import.meta.dirname, "renderer", "index.html"))

  // Connect to Playwright via CDP
  try {
    playwrightBrowser = await chromium.connectOverCDP(`http://localhost:${CDP_PORT}`)
    console.log("Connected to Playwright CDP")
  } catch (err) {
    console.error("Failed to connect to Playwright CDP:", err)
  }

  mainWindow.on("closed", () => {
    mainWindow = null
    browserView = null
  })

  mainWindow.on("resize", () => {
    if (browserView && mainWindow) {
      const newBounds = mainWindow.getBounds()
      browserView.setBounds({
        x: 0,
        y: TOOLBAR_HEIGHT,
        width: newBounds.width,
        height: newBounds.height - TOOLBAR_HEIGHT,
      })
    }
  })
}

// Navigate to URL
ipcMain.handle("navigate", async (_event: IpcMainInvokeEvent, url: string): Promise<void> => {
  if (!browserView) throw new Error("BrowserView not initialized")

  await browserView.webContents.loadURL(url)

  // Get Playwright page handle for the BrowserView
  if (playwrightBrowser) {
    const contexts = playwrightBrowser.contexts()
    for (const context of contexts) {
      const pages = context.pages()
      for (const page of pages) {
        if (page.url() === url || page.url().startsWith(url.split("?")[0])) {
          playwrightPage = page
          console.log("Found Playwright page for URL")
          break
        }
      }
    }
  }
})

// Get current URL
ipcMain.handle("get-url", async (): Promise<string> => {
  if (!browserView) return ""
  return browserView.webContents.getURL()
})

// Fill form with AI
ipcMain.handle(
  "fill-form",
  async (_event: IpcMainInvokeEvent, provider: CliProvider): Promise<{ success: boolean; message: string }> => {
    try {
      if (!browserView) throw new Error("BrowserView not initialized")

      // 1. Get profile from job-finder backend
      console.log("Fetching profile from backend...")
      const profileRes = await fetch(`${API_URL}/config/personal-info`)
      if (!profileRes.ok) {
        throw new Error(`Failed to fetch profile: ${profileRes.status}`)
      }
      const profileData = await profileRes.json()
      const profile: PersonalInfo = profileData.data || profileData

      // 2. Extract form fields from page
      console.log("Extracting form fields...")
      const fields: FormField[] = await browserView.webContents.executeJavaScript(EXTRACT_FORM_SCRIPT)
      console.log(`Found ${fields.length} form fields`)

      if (fields.length === 0) {
        return { success: false, message: "No form fields found on page" }
      }

      // 3. Build prompt and call CLI
      console.log(`Calling ${provider} CLI for field mapping...`)
      const prompt = buildPrompt(fields, profile)
      const instructions = await runCli(provider, prompt)
      console.log(`Got ${instructions.length} fill instructions`)

      // 4. Fill fields using Playwright or executeJavaScript
      console.log("Filling form fields...")
      let filledCount = 0
      for (const instruction of instructions) {
        try {
          if (playwrightPage) {
            await playwrightPage.fill(instruction.selector, instruction.value)
          } else {
            // Fallback to executeJavaScript
            await browserView.webContents.executeJavaScript(`
              const el = document.querySelector('${instruction.selector.replace(/'/g, "\\'")}');
              if (el) {
                el.value = '${instruction.value.replace(/'/g, "\\'")}';
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
              }
            `)
          }
          filledCount++
        } catch (err) {
          console.warn(`Failed to fill ${instruction.selector}:`, err)
        }
      }

      return {
        success: true,
        message: `Filled ${filledCount}/${instructions.length} fields`,
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error("Fill form error:", message)
      return { success: false, message }
    }
  }
)

// Upload resume
ipcMain.handle("upload-resume", async (): Promise<{ success: boolean; message: string }> => {
  try {
    if (!browserView) throw new Error("BrowserView not initialized")

    // Find file input
    const fileInputSelector = await browserView.webContents.executeJavaScript(`
      (() => {
        const fileInput = document.querySelector('input[type="file"]');
        if (!fileInput) return null;
        if (fileInput.id) return '#' + CSS.escape(fileInput.id);
        if (fileInput.name) return 'input[type="file"][name="' + CSS.escape(fileInput.name) + '"]';
        return 'input[type="file"]';
      })()
    `)

    if (!fileInputSelector) {
      return { success: false, message: "No file input found on page" }
    }

    // Get resume path from backend or use default
    const resumePath = path.join(os.homedir(), "resume.pdf")
    if (!fs.existsSync(resumePath)) {
      return { success: false, message: `Resume not found at ${resumePath}` }
    }

    if (playwrightPage) {
      await playwrightPage.setInputFiles(fileInputSelector, resumePath)
      return { success: true, message: "Resume uploaded" }
    } else {
      return { success: false, message: "Playwright connection required for file upload" }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, message }
  }
})

function buildPrompt(fields: FormField[], profile: PersonalInfo): string {
  const profileStr = `
Name: ${profile.name}
Email: ${profile.email}
Phone: ${profile.phone || "Not provided"}
Location: ${profile.location || "Not provided"}
Website: ${profile.website || "Not provided"}
GitHub: ${profile.github || "Not provided"}
LinkedIn: ${profile.linkedin || "Not provided"}
`.trim()

  const fieldsJson = JSON.stringify(fields, null, 2)

  return `Fill this job application form. Return ONLY a JSON array of fill instructions.

## User Profile
${profileStr}

## Form Fields
${fieldsJson}

## Instructions
Return a JSON array where each item has:
- "selector": the CSS selector from the form fields above
- "value": the value to fill

Rules:
1. Only fill fields you're confident about
2. Skip file upload fields (type="file")
3. Skip cover letter or free-text fields asking "why do you want this job"
4. For select dropdowns, the value must match an option exactly
5. Return ONLY valid JSON array, no markdown, no explanation

Example output:
[{"selector": "#email", "value": "john@example.com"}, {"selector": "#phone", "value": "555-1234"}]`
}

function runCli(provider: CliProvider, prompt: string): Promise<FillInstruction[]> {
  const commands: Record<CliProvider, [string, string[]]> = {
    claude: ["claude", ["--print", "--output-format", "json", "-p", prompt]],
    codex: ["codex", ["exec", "--json", "--skip-git-repo-check", "--", prompt]],
    gemini: ["gemini", ["-o", "json", "--yolo", prompt]],
  }

  const [cmd, args] = commands[provider]

  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { shell: true })
    let stdout = ""
    let stderr = ""

    const timeout = setTimeout(() => {
      child.kill("SIGTERM")
      reject(new Error(`${provider} CLI timed out after 60s`))
    }, 60000)

    child.stdout.on("data", (d) => (stdout += d))
    child.stderr.on("data", (d) => (stderr += d))

    child.on("error", (err) => {
      clearTimeout(timeout)
      reject(new Error(`Failed to spawn ${provider} CLI: ${err.message}`))
    })

    child.on("close", (code) => {
      clearTimeout(timeout)
      if (code === 0) {
        try {
          // Try to parse the output as JSON
          // Handle case where CLI might output extra text before/after JSON
          const jsonMatch = stdout.match(/\[[\s\S]*\]/)
          if (jsonMatch) {
            resolve(JSON.parse(jsonMatch[0]))
          } else {
            reject(
              new Error(
                `${provider} CLI returned no JSON array: ${stdout.slice(0, 200)}${stdout.length > 200 ? "..." : ""}`
              )
            )
          }
        } catch {
          reject(
            new Error(
              `${provider} CLI returned invalid JSON: ${stdout.slice(0, 200)}${stdout.length > 200 ? "..." : ""}`
            )
          )
        }
      } else {
        reject(new Error(`${provider} CLI failed (exit ${code}): ${stderr || stdout}`))
      }
    })
  })
}

// App lifecycle
app.whenReady().then(createWindow)

app.on("window-all-closed", () => {
  if (playwrightBrowser) {
    playwrightBrowser.close().catch(console.error)
  }
  if (process.platform !== "darwin") {
    app.quit()
  }
})

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})
