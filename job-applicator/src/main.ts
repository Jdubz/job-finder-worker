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

// CLI provider types
type CliProvider = "claude" | "codex" | "gemini"

interface FillInstruction {
  selector: string
  value: string
}

interface JobExtraction {
  title: string | null
  description: string | null
  location: string | null
  techStack: string | null
  companyName: string | null
}

interface SelectOption {
  value: string
  text: string
}

interface FormField {
  selector: string | null
  type: string
  label: string | null
  placeholder: string | null
  required: boolean
  options: SelectOption[] | null
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

interface ContentItem {
  id: string
  title?: string
  role?: string
  location?: string
  startDate?: string
  endDate?: string
  description?: string
  skills?: string[]
  children?: ContentItem[]
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

    // Extract options for select elements
    const options = el.tagName.toLowerCase() === 'select'
      ? Array.from(el.options).map(opt => ({ value: opt.value, text: opt.textContent?.trim() }))
      : null

    return {
      selector,
      type: el.type || el.tagName.toLowerCase(),
      label: forLabel?.textContent?.trim() || ariaLabel || labelledByEl?.textContent?.trim() || null,
      placeholder: el.placeholder || null,
      required: el.required || false,
      options
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

      // 1. Get profile and work history from job-finder backend
      console.log("Fetching profile from backend...")
      const [profileRes, contentRes] = await Promise.all([
        fetch(`${API_URL}/config/personal-info`),
        fetch(`${API_URL}/content-items?limit=100`)
      ])
      if (!profileRes.ok) {
        throw new Error(`Failed to fetch profile: ${profileRes.status}`)
      }
      const profileData = await profileRes.json()
      const profile: PersonalInfo = profileData.data || profileData

      // Parse work history (optional - don't fail if unavailable)
      let workHistory: ContentItem[] = []
      if (contentRes.ok) {
        const contentData = await contentRes.json()
        workHistory = contentData.data?.items || []
        console.log(`Fetched ${workHistory.length} work history items`)
      }

      // 2. Extract form fields from page
      console.log("Extracting form fields...")
      const fields: FormField[] = await browserView.webContents.executeJavaScript(EXTRACT_FORM_SCRIPT)
      console.log(`Found ${fields.length} form fields`)

      if (fields.length === 0) {
        return { success: false, message: "No form fields found on page" }
      }

      // 3. Build prompt and call CLI
      console.log(`Calling ${provider} CLI for field mapping...`)
      const prompt = buildPrompt(fields, profile, workHistory)
      const instructions = await runCli(provider, prompt)
      console.log(`Got ${instructions.length} fill instructions`)

      // 4. Fill fields using executeJavaScript (reliable with BrowserView)
      // Note: Playwright CDP page matching is unreliable with BrowserView,
      // so we use executeJavaScript directly on the webContents
      console.log("Filling form fields...")
      let filledCount = 0
      for (const instruction of instructions) {
        try {
          const safeSelector = JSON.stringify(instruction.selector)
          const safeValue = JSON.stringify(instruction.value)
          const filled = await browserView.webContents.executeJavaScript(`
            (() => {
              const el = document.querySelector(${safeSelector});
              if (!el) return false;
              if (el.tagName.toLowerCase() === 'select') {
                el.value = ${safeValue};
                el.dispatchEvent(new Event('change', { bubbles: true }));
              } else {
                el.value = ${safeValue};
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
              }
              return true;
            })()
          `)
          if (filled) filledCount++
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

    // File uploads require Playwright - search all pages for one with the file input
    if (!playwrightBrowser) {
      return { success: false, message: "Playwright connection required for file upload" }
    }

    // Get the current URL from BrowserView to find the matching page
    const currentUrl = browserView.webContents.getURL()
    let targetPage: Page | null = null

    for (const context of playwrightBrowser.contexts()) {
      for (const page of context.pages()) {
        // Match by URL (normalize both for comparison)
        if (page.url() === currentUrl || page.url().split("?")[0] === currentUrl.split("?")[0]) {
          targetPage = page
          break
        }
      }
      if (targetPage) break
    }

    if (!targetPage) {
      return { success: false, message: "Could not find Playwright page handle for file upload" }
    }

    await targetPage.setInputFiles(fileInputSelector, resumePath)
    return { success: true, message: "Resume uploaded" }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, message }
  }
})

// Submit job listing for analysis
ipcMain.handle(
  "submit-job",
  async (_event: IpcMainInvokeEvent, provider: CliProvider): Promise<{ success: boolean; message: string }> => {
    try {
      if (!browserView) throw new Error("BrowserView not initialized")

      // 1. Get current URL
      const url = browserView.webContents.getURL()
      if (!url || url === "about:blank") {
        return { success: false, message: "No page loaded - navigate to a job listing first" }
      }

      console.log(`Extracting job details from: ${url}`)

      // 2. Extract page content (text only, limited to 10k chars)
      const pageContent: string = await browserView.webContents.executeJavaScript(`
        document.body.innerText.slice(0, 10000)
      `)

      if (!pageContent || pageContent.trim().length < 100) {
        return { success: false, message: "Page content too short - is this a job listing?" }
      }

      // 3. Use AI CLI to extract job details
      console.log(`Calling ${provider} CLI for job extraction...`)
      const extractPrompt = buildExtractionPrompt(pageContent, url)
      const extracted = await runCliForExtraction(provider, extractPrompt)
      console.log("Extracted job details:", extracted)

      // 4. Submit to backend API with bypassFilter
      console.log("Submitting job to queue...")
      const res = await fetch(`${API_URL}/queue/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          title: extracted.title,
          description: extracted.description,
          location: extracted.location,
          techStack: extracted.techStack,
          companyName: extracted.companyName,
          bypassFilter: true,
          source: "user_submission",
        }),
      })

      if (!res.ok) {
        const errorText = await res.text()
        return { success: false, message: `API error (${res.status}): ${errorText.slice(0, 100)}` }
      }

      const result = await res.json()
      const queueId = result.data?.id || result.id || "unknown"
      return { success: true, message: `Job submitted (queue ID: ${queueId})` }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error("Submit job error:", message)
      return { success: false, message }
    }
  }
)

function buildExtractionPrompt(pageContent: string, url: string): string {
  return `Extract job listing details from this page content.

URL: ${url}

Page Content:
${pageContent}

Return a JSON object with these fields (use null if not found):
{
  "title": "Job title",
  "description": "Full job description (include requirements, responsibilities)",
  "location": "Job location (e.g., Remote, Portland, OR)",
  "techStack": "Technologies mentioned (comma-separated)",
  "companyName": "Company name"
}

Return ONLY valid JSON, no markdown, no explanation.`
}

function runCliForExtraction(provider: CliProvider, prompt: string): Promise<JobExtraction> {
  const commands: Record<CliProvider, [string, string[]]> = {
    claude: ["claude", ["--print", "--output-format", "json", "-p", "-"]],
    codex: ["codex", ["exec", "--json", "--skip-git-repo-check"]],
    gemini: ["gemini", ["-o", "json", "--yolo"]],
  }

  const [cmd, args] = commands[provider]

  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args)
    let stdout = ""
    let stderr = ""

    const timeout = setTimeout(() => {
      child.kill("SIGTERM")
      reject(new Error(`${provider} CLI timed out after 60s`))
    }, 60000)

    child.stdin.write(prompt)
    child.stdin.end()

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
          // Find JSON object in output
          const jsonMatch = stdout.match(/\{[\s\S]*\}/)
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0])
            resolve({
              title: parsed.title ?? null,
              description: parsed.description ?? null,
              location: parsed.location ?? null,
              techStack: parsed.techStack ?? null,
              companyName: parsed.companyName ?? null,
            })
          } else {
            reject(new Error(`${provider} CLI returned no JSON object: ${stdout.slice(0, 200)}`))
          }
        } catch {
          reject(new Error(`${provider} CLI returned invalid JSON: ${stdout.slice(0, 200)}`))
        }
      } else {
        reject(new Error(`${provider} CLI failed (exit ${code}): ${stderr || stdout}`))
      }
    })
  })
}

function formatWorkHistory(items: ContentItem[], indent = 0): string {
  const lines: string[] = []
  for (const item of items) {
    const prefix = "  ".repeat(indent)
    if (item.title) {
      lines.push(`${prefix}- ${item.title}${item.role ? ` (${item.role})` : ""}`)
      if (item.startDate || item.endDate) {
        lines.push(`${prefix}  Period: ${item.startDate || "?"} - ${item.endDate || "present"}`)
      }
      if (item.location) lines.push(`${prefix}  Location: ${item.location}`)
      if (item.description) lines.push(`${prefix}  ${item.description}`)
      if (item.skills?.length) lines.push(`${prefix}  Skills: ${item.skills.join(", ")}`)
      if (item.children?.length) {
        lines.push(formatWorkHistory(item.children, indent + 1))
      }
    }
  }
  return lines.join("\n")
}

function buildPrompt(fields: FormField[], profile: PersonalInfo, workHistory: ContentItem[]): string {
  const profileStr = `
Name: ${profile.name}
Email: ${profile.email}
Phone: ${profile.phone || "Not provided"}
Location: ${profile.location || "Not provided"}
Website: ${profile.website || "Not provided"}
GitHub: ${profile.github || "Not provided"}
LinkedIn: ${profile.linkedin || "Not provided"}
`.trim()

  const workHistoryStr = workHistory.length > 0 ? formatWorkHistory(workHistory) : "Not provided"
  const fieldsJson = JSON.stringify(fields, null, 2)

  return `Fill this job application form. Return ONLY a JSON array of fill instructions.

## User Profile
${profileStr}

## Work History / Experience
${workHistoryStr}

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
4. For select dropdowns, use the "value" property from the options array (not the "text")
5. Return ONLY valid JSON array, no markdown, no explanation

Example output:
[{"selector": "#email", "value": "john@example.com"}, {"selector": "#phone", "value": "555-1234"}]`
}

function runCli(provider: CliProvider, prompt: string): Promise<FillInstruction[]> {
  // Commands without the prompt - we'll pass it via stdin for security
  const commands: Record<CliProvider, [string, string[]]> = {
    claude: ["claude", ["--print", "--output-format", "json", "-p", "-"]],
    codex: ["codex", ["exec", "--json", "--skip-git-repo-check"]],
    gemini: ["gemini", ["-o", "json", "--yolo"]],
  }

  const [cmd, args] = commands[provider]

  return new Promise((resolve, reject) => {
    // Use shell: false for security - avoids command injection
    const child = spawn(cmd, args)
    let stdout = ""
    let stderr = ""

    const timeout = setTimeout(() => {
      child.kill("SIGTERM")
      reject(new Error(`${provider} CLI timed out after 60s`))
    }, 60000)

    // Pass prompt via stdin to avoid shell injection
    child.stdin.write(prompt)
    child.stdin.end()

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
            const parsed = JSON.parse(jsonMatch[0])
            // Validate the response structure
            if (!Array.isArray(parsed)) {
              reject(new Error(`${provider} CLI did not return an array`))
              return
            }
            for (const item of parsed) {
              if (typeof item?.selector !== "string" || typeof item?.value !== "string") {
                reject(new Error(`${provider} CLI returned invalid FillInstruction format`))
                return
              }
            }
            resolve(parsed)
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
