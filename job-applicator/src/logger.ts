import * as fs from "fs"
import * as path from "path"

const LOG_DIR = path.join(import.meta.dirname, "..", "logs")
const LOG_FILE = path.join(LOG_DIR, "app.log")
const MAX_LOG_SIZE = 10 * 1024 * 1024 // 10MB
const MAX_LOG_FILES = 5

// Track if file logging is available (may fail due to permissions)
let fileLoggingEnabled = true

// Ensure log directory exists with error handling
try {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true })
  }
} catch (err) {
  console.warn("Failed to create log directory, file logging disabled:", err)
  fileLoggingEnabled = false
}

function timestamp(): string {
  return new Date().toISOString()
}

function rotateLogs(): void {
  try {
    // Delete the oldest log if it exists
    const oldest = `${LOG_FILE}.${MAX_LOG_FILES}`
    if (fs.existsSync(oldest)) {
      fs.unlinkSync(oldest)
    }
    // Rename existing logs (app.log.4 -> app.log.5, etc.)
    for (let i = MAX_LOG_FILES - 1; i >= 1; i--) {
      const src = `${LOG_FILE}.${i}`
      const dest = `${LOG_FILE}.${i + 1}`
      if (fs.existsSync(src)) {
        fs.renameSync(src, dest)
      }
    }
    // Move current log to .1
    if (fs.existsSync(LOG_FILE)) {
      fs.renameSync(LOG_FILE, `${LOG_FILE}.1`)
    }
  } catch (err) {
    console.error("Failed to rotate logs:", err)
  }
}

function checkRotation(): void {
  try {
    if (fs.existsSync(LOG_FILE)) {
      const stats = fs.statSync(LOG_FILE)
      if (stats.size >= MAX_LOG_SIZE) {
        rotateLogs()
      }
    }
  } catch {
    // Ignore stat errors, continue logging
  }
}

function writeToFile(level: string, ...args: unknown[]): void {
  if (!fileLoggingEnabled) return

  const message = args
    .map((arg) => (typeof arg === "object" ? JSON.stringify(arg, null, 2) : String(arg)))
    .join(" ")
  const line = `[${timestamp()}] [${level}] ${message}\n`

  // Check rotation before writing (sync check, async write)
  checkRotation()

  // Use async append to avoid blocking the main thread
  fs.appendFile(LOG_FILE, line, (err) => {
    if (err) {
      // Use console.error to avoid recursive logging loop
      console.error("Failed to write to log file:", err)
    }
  })
}

export const logger = {
  info(...args: unknown[]): void {
    console.log("[INFO]", ...args)
    writeToFile("INFO", ...args)
  },
  warn(...args: unknown[]): void {
    console.warn("[WARN]", ...args)
    writeToFile("WARN", ...args)
  },
  error(...args: unknown[]): void {
    console.error("[ERROR]", ...args)
    writeToFile("ERROR", ...args)
  },
  debug(...args: unknown[]): void {
    console.log("[DEBUG]", ...args)
    writeToFile("DEBUG", ...args)
  },
}

// Log startup
if (fileLoggingEnabled) {
  logger.info("Logger initialized, writing to:", LOG_FILE)
} else {
  console.log("[INFO] Logger initialized (console only, file logging unavailable)")
}
