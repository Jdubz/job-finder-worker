import type { Request } from 'express'
import { loggingService } from './logging.service'
import { logger } from '../../logger'

export const loggingController = {
  async storeLogs(req: Request) {
    const { logs, sessionId } = req.body

    try {
      const result = await loggingService.storeLogs(logs)

      logger.info({
        msg: 'Frontend logs stored',
        count: logs.length,
        sessionId,
      })

      return {
        success: true,
        stored: result.stored,
        failed: result.failed,
      }
    } catch (error) {
      logger.error({
        msg: 'Failed to store frontend logs',
        error,
        sessionId,
      })
      throw error
    }
  },
}