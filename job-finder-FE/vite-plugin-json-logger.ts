/**
 * Vite Plugin: JSON Logger
 *
 * Custom Vite logger that writes structured JSON logs to dev-monitor/logs/
 * instead of plain text console output.
 *
 * Features:
 * - Structured JSON logging for all Vite messages
 * - Writes to centralized log file in dev-monitor
 * - Compatible with LogWatcher for real-time streaming
 * - Preserves console output for developer visibility
 */

import type {
  Plugin,
  Logger,
  LogLevel,
  LogType,
  LogOptions,
  LogErrorOptions,
  ResolvedConfig,
} from "vite"
import { createLogger } from "vite"
import * as fs from "fs"
import * as path from "path"

export interface JsonLoggerOptions {
  /**
   * Path to the log file
   * @default '../dev-monitor/logs/frontend.log'
   */
  logFile?: string

  /**
   * Service name for log entries
   * @default 'frontend-dev'
   */
  serviceName?: string

  /**
   * Enable console output alongside file logging
   * @default true
   */
  enableConsole?: boolean
}

type LogSeverity = "DEBUG" | "INFO" | "WARNING" | "ERROR"

interface StructuredLogEntry {
  severity: LogSeverity
  timestamp: string
  environment: string
  service: string
  category: string
  action: string
  message: string
  details?: Record<string, unknown>
}

export function jsonLogger(options: JsonLoggerOptions = {}): Plugin {
  const {
    logFile = path.resolve(__dirname, "./logs/frontend.log"),
    serviceName = "frontend-dev",
    enableConsole = true,
  } = options

  let config: ResolvedConfig
  let defaultLogger: Logger
  let writeStream: fs.WriteStream

  /**
   * Map Vite log level to our severity
   */
  function getSeverity(level: LogLevel): LogSeverity {
    switch (level) {
      case "error":
        return "ERROR"
      case "warn":
        return "WARNING"
      case "info":
        return "INFO"
      default:
        return "DEBUG"
    }
  }

  /**
   * Detect category from message content
   */
  function detectCategory(message: string): string {
    const lowerMsg = message.toLowerCase()

    if (lowerMsg.includes("vite")) return "build"
    if (lowerMsg.includes("hmr") || lowerMsg.includes("reload")) return "hmr"
    if (lowerMsg.includes("server")) return "server"
    if (lowerMsg.includes("build")) return "build"

    return "system"
  }

  /**
   * Detect action from message content
   */
  function detectAction(message: string, level: LogLevel): string {
    const lowerMsg = message.toLowerCase()

    if (lowerMsg.includes("ready")) return "ready"
    if (lowerMsg.includes("listening")) return "listening"
    if (lowerMsg.includes("start")) return "starting"
    if (lowerMsg.includes("stop") || lowerMsg.includes("exit")) return "stopping"
    if (lowerMsg.includes("build")) return "building"
    if (lowerMsg.includes("error") && level === "error") return "error"
    if (lowerMsg.includes("warn") && level === "warn") return "warning"

    return "log"
  }

  /**
   * Strip ANSI color codes
   */
  function stripAnsi(text: string): string {
    // eslint-disable-next-line no-control-regex
    return text.replace(/\x1b\[[0-9;]*m/g, "")
  }

  /**
   * Write structured log entry to file
   */
  function writeLog(level: LogLevel, message: string) {
    const cleanMessage = stripAnsi(message)
    const severity = getSeverity(level)
    const category = detectCategory(cleanMessage)
    const action = detectAction(cleanMessage, level)

    const logEntry: StructuredLogEntry = {
      severity,
      timestamp: new Date().toISOString(),
      environment: "development",
      service: serviceName,
      category,
      action,
      message: cleanMessage,
    }

    if (writeStream) {
      writeStream.write(JSON.stringify(logEntry) + "\n")
    }
  }

  /**
   * Create custom logger that writes JSON and optionally to console
   */
  function createCustomLogger(): Logger {
    const base = createLogger()

    return {
      info(msg: string, opts?: LogOptions) {
        writeLog("info", msg)
        if (enableConsole) {
          base.info(msg, opts)
        }
      },
      warn(msg: string, opts?: LogOptions) {
        writeLog("warn", msg)
        if (enableConsole) {
          base.warn(msg, opts)
        }
      },
      warnOnce(msg: string, opts?: LogOptions) {
        writeLog("warn", msg)
        if (enableConsole) {
          base.warnOnce(msg, opts)
        }
      },
      error(msg: string, opts?: LogErrorOptions) {
        writeLog("error", msg)
        if (enableConsole) {
          base.error(msg, opts)
        }
      },
      clearScreen(type: LogType) {
        if (enableConsole) {
          base.clearScreen(type)
        }
      },
      hasErrorLogged(error: Error) {
        return base.hasErrorLogged(error)
      },
      hasWarned: base.hasWarned,
    }
  }

  return {
    name: "vite-plugin-json-logger",

    configResolved(resolvedConfig) {
      config = resolvedConfig

      // Only enable in development mode
      if (config.mode === "development") {
        // Ensure log directory exists
        const logDir = path.dirname(logFile)
        if (!fs.existsSync(logDir)) {
          fs.mkdirSync(logDir, { recursive: true })
        }

        // Create write stream
        writeStream = fs.createWriteStream(logFile, { flags: "a" })

        // Create and assign custom logger
        defaultLogger = createCustomLogger()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(config as any).logger = defaultLogger
      }
    },

    buildEnd() {
      if (writeStream) {
        writeStream.end()
      }
    },
  }
}
