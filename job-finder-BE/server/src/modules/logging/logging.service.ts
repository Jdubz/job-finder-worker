import { promises as fs } from 'fs'
import * as path from 'path'
import * as fsSync from 'fs'
import { logger } from '../../logger'
import { env } from '../../config/env'

const MAX_TOTAL_BYTES = 512 * 1024 // 512KB per request
const MAX_ENTRY_BYTES = 16 * 1024 // 16KB per log entry before truncation
const logDirCache = { ensured: false }

function ensureLogDir(dir: string) {
  if (logDirCache.ensured) return
  if (!fsSync.existsSync(dir)) {
    fsSync.mkdirSync(dir, { recursive: true })
  }
  logDirCache.ensured = true
}

function truncateEntry(entry: any) {
  const cloned = { ...entry }
  const fieldsToTrim = ['message', 'details', 'payload']
  for (const key of fieldsToTrim) {
    if (typeof cloned[key] === 'string' && Buffer.byteLength(cloned[key], 'utf8') > MAX_ENTRY_BYTES) {
      cloned[key] = `${cloned[key].slice(0, MAX_ENTRY_BYTES)}…`
    }
  }
  return cloned
}

/**
 * Simple file-based logging service
 *
 * Writes frontend logs to a file.
 * Production: /srv/job-finder/logs/frontend.log
 * Development: ./logs/frontend.log
 */
export const loggingService = {
  getLogFilePath(): string {
    const logDir = env.LOG_DIR || path.join(process.cwd(), 'logs')
    ensureLogDir(logDir)
    return path.join(logDir, 'frontend.log')
  },

  async storeLogs(logs: any[]): Promise<{ stored: number; failed: number }> {
    const logFile = this.getLogFilePath()

    if (!logs || logs.length === 0) {
      return { stored: 0, failed: 0 }
    }

    const normalized = logs.map((log) => {
      const entry = truncateEntry(log)
      return JSON.stringify({
        ...entry,
        timestamp: new Date().toISOString()
      })
    })

    const content = normalized.join('\n') + '\n'

    if (Buffer.byteLength(content, 'utf8') > MAX_TOTAL_BYTES) {
      logger.warn({ bytes: Buffer.byteLength(content, 'utf8'), max: MAX_TOTAL_BYTES }, 'Rejected log batch: too large')
      return { stored: 0, failed: logs.length }
    }

    try {
      // Single async write operation
      await fs.appendFile(logFile, content)
      return { stored: logs.length, failed: 0 }
    } catch (error) {
      logger.error({ msg: 'Failed to write logs to file', error })
      return { stored: 0, failed: logs.length }
    }
  }
}
