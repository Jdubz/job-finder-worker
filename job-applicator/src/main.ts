import { app, BrowserWindow, BrowserView, ipcMain, IpcMainInvokeEvent } from "electron"
import { chromium, Browser, Page } from "playwright-core"
import { spawn } from "child_process"
import * as path from "path"
import * as fs from "fs"
import * as os from "os"

// Configuration from environment
const CDP_PORT = process.env.CDP_PORT || "9222"
// NOTE: The default API_URL uses HTTP and is intended for local development only.
// In production, always set JOB_FINDER_API_URL to a secure HTTPS endpoint.
const API_URL = process.env.JOB_FINDER_API_URL || "http://localhost:3000/api"

// Warn if using HTTP in non-development environments
if (API_URL.startsWith("http://") && process.env.NODE_ENV === "production") {
  console.warn(
    "[SECURITY WARNING] API_URL is using HTTP in production. " +
      "This may expose sensitive data. Please use HTTPS for production deployments."
  )
}

// Layout constants
const TOOLBAR_HEIGHT = 60
const SIDEBAR_WIDTH = 300

// Enable remote debugging for Playwright CDP connection
app.commandLine.appendSwitch("remote-debugging-port", CDP_PORT)

// Global state
let mainWindow: BrowserWindow | null = null
let browserView: BrowserView | null = null
let playwrightBrowser: Browser | null = null
let sidebarOpen = false
let cdpConnected = false

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

interface EEOInfo {
  race?: string
  hispanicLatino?: string
  gender?: string
  veteranStatus?: string
  disabilityStatus?: string
}

interface PersonalInfo {
  name: string
  email: string
  phone?: string
  location?: string
  website?: string
  github?: string
  linkedin?: string
  summary?: string
  eeo?: EEOInfo
}

interface FormFillSummary {
  totalFields: number
  filledCount: number
  skippedCount: number
  skippedFields: Array<{ label: string; reason: string }>
  duration: number
}

interface EnhancedFillInstruction {
  selector: string
  value: string | null
  status: "filled" | "skipped"
  reason?: string
  label?: string
}

// EEO display values for form filling
const EEO_DISPLAY: Record<string, Record<string, string>> = {
  race: {
    american_indian_alaska_native: "American Indian or Alaska Native",
    asian: "Asian",
    black_african_american: "Black or African American",
    native_hawaiian_pacific_islander: "Native Hawaiian or Other Pacific Islander",
    white: "White",
    two_or_more_races: "Two or More Races",
    decline_to_identify: "Decline to Self-Identify",
  },
  hispanicLatino: {
    yes: "Yes",
    no: "No",
    decline_to_identify: "Decline to Self-Identify",
  },
  gender: {
    male: "Male",
    female: "Female",
    decline_to_identify: "Decline to Self-Identify",
  },
  veteranStatus: {
    not_protected_veteran: "I am not a protected veteran",
    protected_veteran: "I identify as one or more of the classifications of a protected veteran",
    disabled_veteran: "I am a disabled veteran",
    decline_to_identify: "Decline to Self-Identify",
  },
  disabilityStatus: {
    yes: "Yes, I Have A Disability, Or Have A History/Record Of Having A Disability",
    no: "No, I Don't Have A Disability",
    decline_to_identify: "Decline to Self-Identify",
  },
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

// Update BrowserView bounds based on sidebar state
function updateBrowserViewBounds(): void {
  if (!browserView || !mainWindow) return
  const bounds = mainWindow.getBounds()
  const offsetX = sidebarOpen ? SIDEBAR_WIDTH : 0
  browserView.setBounds({
    x: offsetX,
    y: TOOLBAR_HEIGHT,
    width: bounds.width - offsetX,
    height: bounds.height - TOOLBAR_HEIGHT,
  })
}

// Normalize URL for comparison (origin + pathname only)
function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url)
    return `${parsed.origin}${parsed.pathname}`
  } catch {
    return url
  }
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

  // Position BrowserView below toolbar, accounting for sidebar state
  updateBrowserViewBounds()
  browserView.setAutoResize({ width: true, height: true })

  // Load the renderer UI (toolbar)
  await mainWindow.loadFile(path.join(import.meta.dirname, "renderer", "index.html"))

  // Connect to Playwright via CDP
  try {
    playwrightBrowser = await chromium.connectOverCDP(`http://localhost:${CDP_PORT}`)
    cdpConnected = true
    console.log("Connected to Playwright CDP")
  } catch (err) {
    cdpConnected = false
    console.error("Failed to connect to Playwright CDP:", err)
    // Notify renderer of CDP connection failure (file uploads will be unavailable)
    mainWindow.webContents.send("cdp-status", {
      connected: false,
      message: "Playwright CDP connection failed. File uploads will be unavailable.",
    })
  }

  mainWindow.on("closed", () => {
    mainWindow = null
    browserView = null
  })

  mainWindow.on("resize", () => {
    updateBrowserViewBounds()
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

      // Validate required profile fields
      if (!profile.name || !profile.email) {
        throw new Error("Profile missing required fields (name, email). Please configure your profile first.")
      }

      // Parse work history (optional - don't fail if unavailable)
      let workHistory: ContentItem[] = []
      if (contentRes.ok) {
        const contentData = await contentRes.json()
        workHistory = contentData.data || []
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

    // Get resume path from environment variable or use default
    const resumePath = process.env.RESUME_PATH || path.join(os.homedir(), "resume.pdf")
    if (!fs.existsSync(resumePath)) {
      return { success: false, message: `Resume not found at ${resumePath}. Set RESUME_PATH environment variable to specify location.` }
    }

    // File uploads require Playwright - search all pages for one with the file input
    if (!playwrightBrowser) {
      return { success: false, message: "Playwright connection required for file upload" }
    }

    // Get the current URL from BrowserView to find the matching page
    const currentUrl = browserView.webContents.getURL()
    const currentNormalized = normalizeUrl(currentUrl)
    let targetPage: Page | null = null

    for (const context of playwrightBrowser.contexts()) {
      for (const page of context.pages()) {
        // Match by normalized URL (origin + pathname)
        if (normalizeUrl(page.url()) === currentNormalized) {
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

// Sidebar state handlers
ipcMain.handle("set-sidebar-state", async (_event: IpcMainInvokeEvent, open: boolean): Promise<void> => {
  sidebarOpen = open
  updateBrowserViewBounds()
})

ipcMain.handle("get-sidebar-state", async (): Promise<{ open: boolean }> => {
  return { open: sidebarOpen }
})

// CDP connection status
ipcMain.handle("get-cdp-status", async (): Promise<{ connected: boolean; message?: string }> => {
  return {
    connected: cdpConnected,
    message: cdpConnected ? undefined : "Playwright CDP not connected. File uploads unavailable.",
  }
})

// Get job matches from backend
ipcMain.handle(
  "get-job-matches",
  async (
    _event: IpcMainInvokeEvent,
    options?: { limit?: number; status?: string }
  ): Promise<{ success: boolean; data?: unknown[]; message?: string }> => {
    try {
      const limit = options?.limit || 50
      const status = options?.status || "active"
      const res = await fetch(`${API_URL}/job-matches/?limit=${limit}&status=${status}&sortBy=updated&sortOrder=desc`)
      if (!res.ok) {
        return { success: false, message: `Failed to fetch job matches: ${res.status}` }
      }
      const data = await res.json()
      return { success: true, data: data.data || data }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { success: false, message }
    }
  }
)

// Get single job match with full details
ipcMain.handle(
  "get-job-match",
  async (_event: IpcMainInvokeEvent, id: string): Promise<{ success: boolean; data?: unknown; message?: string }> => {
    try {
      const res = await fetch(`${API_URL}/job-matches/${id}`)
      if (!res.ok) {
        return { success: false, message: `Failed to fetch job match: ${res.status}` }
      }
      const data = await res.json()
      return { success: true, data: data.data || data }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { success: false, message }
    }
  }
)

// Get documents for a job match
ipcMain.handle(
  "get-documents",
  async (_event: IpcMainInvokeEvent, jobMatchId: string): Promise<{ success: boolean; data?: unknown[]; message?: string }> => {
    try {
      const res = await fetch(`${API_URL}/generator/job-matches/${jobMatchId}/documents`)
      if (!res.ok) {
        // 404 is fine - means no documents yet
        if (res.status === 404) {
          return { success: true, data: [] }
        }
        return { success: false, message: `Failed to fetch documents: ${res.status}` }
      }
      const data = await res.json()
      return { success: true, data: data.data || data || [] }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { success: false, message }
    }
  }
)

// Start document generation
ipcMain.handle(
  "start-generation",
  async (
    _event: IpcMainInvokeEvent,
    options: { jobMatchId: string; type: "resume" | "coverLetter" | "both" }
  ): Promise<{ success: boolean; requestId?: string; message?: string }> => {
    try {
      // First get the job match to get job details
      const matchRes = await fetch(`${API_URL}/job-matches/${options.jobMatchId}`)
      if (!matchRes.ok) {
        return { success: false, message: `Failed to fetch job match: ${matchRes.status}` }
      }
      const matchData = await matchRes.json()
      const match = matchData.data || matchData

      // Start generation
      const res = await fetch(`${API_URL}/generator/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          generateType: options.type,
          job: {
            role: match.listing?.title || "Unknown Role",
            company: match.listing?.companyName || "Unknown Company",
            jobDescriptionUrl: match.listing?.url,
            jobDescriptionText: match.listing?.description,
            location: match.listing?.location,
          },
          jobMatchId: options.jobMatchId,
        }),
      })

      if (!res.ok) {
        const errorText = await res.text()
        return { success: false, message: `Generation failed: ${errorText.slice(0, 100)}` }
      }

      const data = await res.json()
      return { success: true, requestId: data.requestId || data.id }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { success: false, message }
    }
  }
)

// Enhanced form fill with EEO, job match context, and results tracking
ipcMain.handle(
  "fill-form-enhanced",
  async (
    _event: IpcMainInvokeEvent,
    options: { provider: CliProvider; jobMatchId?: string; documentId?: string }
  ): Promise<{ success: boolean; data?: FormFillSummary; message?: string }> => {
    const startTime = Date.now()

    try {
      if (!browserView) throw new Error("BrowserView not initialized")

      // 1. Get profile with EEO from backend
      console.log("Fetching profile from backend...")
      const profileRes = await fetch(`${API_URL}/config/personal-info`)
      if (!profileRes.ok) {
        throw new Error(`Failed to fetch profile: ${profileRes.status}`)
      }
      const profileData = await profileRes.json()
      const profile: PersonalInfo = profileData.data || profileData

      // Validate required profile fields
      if (!profile.name || !profile.email) {
        throw new Error("Profile missing required fields (name, email). Please configure your profile first.")
      }

      // 2. Get content items (work history)
      const contentRes = await fetch(`${API_URL}/content-items?limit=100`)
      let workHistory: ContentItem[] = []
      if (contentRes.ok) {
        const contentData = await contentRes.json()
        workHistory = contentData.data || []
      }

      // 3. Get job match data if provided
      let jobMatchData: Record<string, unknown> | null = null
      if (options.jobMatchId) {
        const matchRes = await fetch(`${API_URL}/job-matches/${options.jobMatchId}`)
        if (matchRes.ok) {
          const matchJson = await matchRes.json()
          jobMatchData = matchJson.data || matchJson
        }
      }

      // 4. Extract form fields from page
      console.log("Extracting form fields...")
      const fields: FormField[] = await browserView.webContents.executeJavaScript(EXTRACT_FORM_SCRIPT)
      console.log(`Found ${fields.length} form fields`)

      if (fields.length === 0) {
        return { success: false, message: "No form fields found on page" }
      }

      // 5. Build enhanced prompt
      const prompt = buildEnhancedPrompt(fields, profile, workHistory, jobMatchData)
      console.log(`Calling ${options.provider} CLI for enhanced field mapping...`)

      // 6. Call CLI for fill instructions with skip tracking
      const instructions = await runEnhancedCli(options.provider, prompt)
      console.log(`Got ${instructions.length} fill instructions`)

      // 7. Fill fields and track results
      let filledCount = 0
      const skippedFields: Array<{ label: string; reason: string }> = []

      for (const instruction of instructions) {
        if (instruction.status === "skipped") {
          skippedFields.push({
            label: instruction.label || instruction.selector || "Unknown field",
            reason: instruction.reason || "No data available",
          })
          continue
        }

        if (!instruction.value) continue

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

      const duration = Date.now() - startTime
      const summary: FormFillSummary = {
        totalFields: fields.length,
        filledCount,
        skippedCount: skippedFields.length,
        skippedFields,
        duration,
      }

      return { success: true, data: summary }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error("Enhanced fill form error:", message)
      return { success: false, message }
    }
  }
)

function formatEEOValue(field: string, value: string | undefined): string {
  if (!value) return "Not provided - skip this field"
  return EEO_DISPLAY[field]?.[value] || value
}

function buildEnhancedPrompt(
  fields: FormField[],
  profile: PersonalInfo,
  workHistory: ContentItem[],
  jobMatch: Record<string, unknown> | null
): string {
  const eeoSection = profile.eeo
    ? `
## EEO Information (US Equal Employment Opportunity)
Race: ${formatEEOValue("race", profile.eeo.race)}
Hispanic/Latino: ${formatEEOValue("hispanicLatino", profile.eeo.hispanicLatino)}
Gender: ${formatEEOValue("gender", profile.eeo.gender)}
Veteran Status: ${formatEEOValue("veteranStatus", profile.eeo.veteranStatus)}
Disability Status: ${formatEEOValue("disabilityStatus", profile.eeo.disabilityStatus)}
`
    : "\n## EEO Information\nNot provided - skip EEO fields\n"

  const jobContextSection = jobMatch
    ? `
## Job-Specific Context
Company: ${(jobMatch.listing as Record<string, unknown>)?.companyName || "Unknown"}
Role: ${(jobMatch.listing as Record<string, unknown>)?.title || "Unknown"}
Matched Skills: ${(jobMatch.matchedSkills as string[])?.join(", ") || "N/A"}
ATS Keywords: ${(jobMatch.resumeIntakeData as Record<string, unknown>)?.atsKeywords?.toString() || "N/A"}
`
    : ""

  return `Fill this job application form. Return a JSON array with status for each field.

## CRITICAL SAFETY RULES
1. NEVER fill or interact with submit/apply buttons
2. Skip any field that would submit the form
3. The user must manually click the final submit button

## User Profile
Name: ${profile.name}
Email: ${profile.email}
Phone: ${profile.phone || "Not provided"}
Location: ${profile.location || "Not provided"}
Website: ${profile.website || "Not provided"}
GitHub: ${profile.github || "Not provided"}
LinkedIn: ${profile.linkedin || "Not provided"}
Summary: ${profile.summary || "Not provided"}
${eeoSection}
## Work History / Experience
${workHistory.length > 0 ? formatWorkHistory(workHistory) : "Not provided"}
${jobContextSection}
## Form Fields
${JSON.stringify(fields, null, 2)}

## Response Format
Return a JSON array. For EACH form field, include a status and label:
[
  {"selector": "#email", "label": "Email Address", "value": "user@example.com", "status": "filled"},
  {"selector": "#coverLetter", "label": "Cover Letter", "value": null, "status": "skipped", "reason": "Requires custom text"}
]

Rules:
1. For select dropdowns, use the "value" property from options (not "text")
2. Skip file upload fields (type="file") - status: "skipped", reason: "File upload"
3. Skip submit buttons - status: "skipped", reason: "Submit button"
4. For EEO fields, use the display values provided above or skip if not provided
5. If no data available for a required field, mark status: "skipped" with reason
6. Return ONLY valid JSON array, no markdown, no explanation`
}

function runEnhancedCli(provider: CliProvider, prompt: string): Promise<EnhancedFillInstruction[]> {
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
      // Provide helpful error if CLI tool is not installed
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        reject(new Error(`${provider} CLI not found. Please install it first and ensure it's in your PATH.`))
      } else {
        reject(new Error(`Failed to spawn ${provider} CLI: ${err.message}`))
      }
    })

    child.on("close", (code) => {
      clearTimeout(timeout)
      if (code === 0) {
        try {
          // Find first [ and last ] for more robust JSON extraction
          const startIdx = stdout.indexOf("[")
          const endIdx = stdout.lastIndexOf("]")
          if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
            const jsonStr = stdout.substring(startIdx, endIdx + 1)
            const parsed = JSON.parse(jsonStr)
            if (!Array.isArray(parsed)) {
              reject(new Error(`${provider} CLI did not return an array`))
              return
            }
            resolve(
              parsed.map((item: Record<string, unknown>) => ({
                selector: String(item.selector || ""),
                value: item.value != null ? String(item.value) : null,
                status: item.status === "skipped" ? "skipped" : "filled",
                reason: item.reason ? String(item.reason) : undefined,
                label: item.label ? String(item.label) : undefined,
              }))
            )
          } else {
            reject(new Error(`${provider} CLI returned no JSON array: ${stdout.slice(0, 200)}`))
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          reject(new Error(`${provider} CLI returned invalid JSON: ${msg}\n${stdout.slice(0, 200)}`))
        }
      } else {
        reject(new Error(`${provider} CLI failed (exit ${code}): ${stderr || stdout}`))
      }
    })
  })
}

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
      // Provide helpful error if CLI tool is not installed
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        reject(new Error(`${provider} CLI not found. Please install it first and ensure it's in your PATH.`))
      } else {
        reject(new Error(`Failed to spawn ${provider} CLI: ${err.message}`))
      }
    })

    child.on("close", (code) => {
      clearTimeout(timeout)
      if (code === 0) {
        try {
          // Find first { and last } for more robust JSON extraction
          const startIdx = stdout.indexOf("{")
          const endIdx = stdout.lastIndexOf("}")
          if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
            const jsonStr = stdout.substring(startIdx, endIdx + 1)
            const parsed = JSON.parse(jsonStr)
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
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          reject(new Error(`${provider} CLI returned invalid JSON: ${msg}\n${stdout.slice(0, 200)}`))
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
      // Provide helpful error if CLI tool is not installed
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        reject(new Error(`${provider} CLI not found. Please install it first and ensure it's in your PATH.`))
      } else {
        reject(new Error(`Failed to spawn ${provider} CLI: ${err.message}`))
      }
    })

    child.on("close", (code) => {
      clearTimeout(timeout)
      if (code === 0) {
        try {
          // Find first [ and last ] for more robust JSON extraction
          const startIdx = stdout.indexOf("[")
          const endIdx = stdout.lastIndexOf("]")
          if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
            const jsonStr = stdout.substring(startIdx, endIdx + 1)
            const parsed = JSON.parse(jsonStr)
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
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          reject(
            new Error(
              `${provider} CLI returned invalid JSON: ${msg}\n${stdout.slice(0, 200)}${stdout.length > 200 ? "..." : ""}`
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
