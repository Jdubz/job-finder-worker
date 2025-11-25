import { promises as fs } from 'fs'
import * as path from 'path'
import * as fsSync from 'fs'
import { logger } from '../../logger'

/**
 * Simple file-based logging service
 *
 * Writes frontend logs to a file.
 * Production: /srv/job-finder/logs/frontend.log
 * Development: ./logs/frontend.log
 */
export const loggingService = {
  getLogFilePath(): string {
    const isProd = process.env.NODE_ENV === 'production'
    const logDir = isProd ? '/srv/job-finder/logs' : path.join(process.cwd(), 'logs')

    // Ensure directory exists
    if (!fsSync.existsSync(logDir)) {
      fsSync.mkdirSync(logDir, { recursive: true })
    }

    return path.join(logDir, 'frontend.log')
  },

  async storeLogs(logs: any[]): Promise<{ stored: number; failed: number }> {
    const logFile = this.getLogFilePath()

    if (!logs || logs.length === 0) {
      return { stored: 0, failed: 0 }
    }

    // Process all logs into a single string
    const content = logs.map(log => {
      const logEntry = {
        ...log,
        timestamp: new Date().toISOString()
      }
      return JSON.stringify(logEntry)
    }).join('\n') + '\n'

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