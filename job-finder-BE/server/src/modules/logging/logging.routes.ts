import { Router } from 'express'
import { asyncHandler } from '../../utils/async-handler'
import { success } from '../../utils/api-response'
import { loggingController } from './logging.controller'
import { validateLogRequest } from './logging.validation'
import { rateLimit } from '../../middleware/rate-limit'

export function buildLoggingRouter(): Router {
  const router = Router()

  // Mitigate abusive log ingestion (local, low-volume limiter)
  const logRateLimiter = rateLimit({ windowMs: 60_000, max: 30 })

  // Receive and store logs from frontend
  router.post(
    '/',
    logRateLimiter,
    validateLogRequest,
    asyncHandler(async (req, res) => {
      const result = await loggingController.storeLogs(req)
      res.json(success(result))
    })
  )

  return router
}
