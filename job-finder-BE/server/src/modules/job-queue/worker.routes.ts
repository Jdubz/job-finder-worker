/**
 * Worker bridge routes for queue events and commands.
 * These endpoints use worker token auth instead of Google OAuth.
 */
import { Router } from 'express'
import { ApiErrorCode } from '@shared/types'
import { asyncHandler } from '../../utils/async-handler'
import { success, failure } from '../../utils/api-response'
import { broadcastQueueEvent, takePendingCommands } from './queue-events'
import { verifyWorkerToken } from '../../middleware/worker-auth'

export function buildWorkerRouter() {
  const router = Router()

  // All worker routes require worker token authentication
  router.use(verifyWorkerToken)

  // Worker bridge: poll commands (simple long-poll friendly GET)
  router.get(
    '/commands',
    asyncHandler((req, res) => {
      const workerId = typeof req.query.workerId === 'string' ? req.query.workerId : 'default'
      const commands = takePendingCommands(workerId)
      res.json(success({ commands }))
    })
  )

  // Worker bridge: ingest events and fan out to SSE listeners
  router.post(
    '/events',
    asyncHandler((req, res) => {
      const { event, data } = req.body as { event?: string; data?: Record<string, unknown> }
      if (!event) {
        res.status(400).json(failure(ApiErrorCode.INVALID_REQUEST, 'Missing event'))
        return
      }
      broadcastQueueEvent(event as any, data ?? {})
      res.json(success({ received: true }))
    })
  )

  return router
}
