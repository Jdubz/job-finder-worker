import * as fs from "fs"
import * as path from "path"

const LOG_DIR = path.join(import.meta.dirname, "..", "logs")
const LOG_FILE = path.join(LOG_DIR, "app.log")

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true })
}

function timestamp(): string {
  return new Date().toISOString()
}

function writeToFile(level: string, ...args: unknown[]): void {
  const message = args
    .map((arg) => (typeof arg === "object" ? JSON.stringify(arg, null, 2) : String(arg)))
    .join(" ")
  const line = `[${timestamp()}] [${level}] ${message}\n`
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
logger.info("Logger initialized, writing to:", LOG_FILE)
