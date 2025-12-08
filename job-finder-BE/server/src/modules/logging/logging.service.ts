import { promises as fs } from 'fs'
import * as path from 'path'
import * as fsSync from 'fs'
import { logger } from '../../logger'
import { env } from '../../config/env'

const MAX_TOTAL_BYTES = 512 * 1024 // 512KB per request
const MAX_ENTRY_BYTES = 16 * 1024 // 16KB per log entry before truncation

function ensureLogDir(dir: string) {
  if (!fsSync.existsSync(dir)) {
    fsSync.mkdirSync(dir, { recursive: true })
  }
}

function truncateEntry(entry: any) {
  const cloned = { ...entry }
  const fieldsToTrim = ['message', 'details', 'payload']
  for (const key of fieldsToTrim) {
    if (typeof cloned[key] === 'string' && Buffer.byteLength(cloned[key], 'utf8') > MAX_ENTRY_BYTES) {
      const original = cloned[key] as string
      let left = 0
      let right = original.length
      let best = ''
      while (left <= right) {
        const mid = Math.floor((left + right) / 2)
        const candidate = original.slice(0, mid)
        const bytes = Buffer.byteLength(candidate, 'utf8')
        if (bytes <= MAX_ENTRY_BYTES) {
          best = candidate
          left = mid + 1
        } else {
          right = mid - 1
        }
      }
      cloned[key] = `${best}…`
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
    const logDir = env.LOG_DIR
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
