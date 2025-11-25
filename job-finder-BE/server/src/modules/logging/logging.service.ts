import * as fs from 'fs'
import * as path from 'path'
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
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true })
    }

    return path.join(logDir, 'frontend.log')
  },

  async storeLogs(logs: any[]): Promise<{ stored: number; failed: number }> {
    const logFile = this.getLogFilePath()
    let stored = 0
    let failed = 0

    for (const log of logs) {
      try {
        // Add timestamp and write as JSON line
        const logEntry = {
          ...log,
          timestamp: new Date().toISOString()
        }

        fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n')
        stored++
      } catch (error) {
        logger.error({ msg: 'Failed to write log', error })
        failed++
      }
    }

    return { stored, failed }
  }
}