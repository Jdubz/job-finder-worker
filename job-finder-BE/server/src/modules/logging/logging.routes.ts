import { Router } from 'express'
import { asyncHandler } from '../../utils/async-handler'
import { success } from '../../utils/api-response'
import { loggingController } from './logging.controller'
import { validateLogRequest } from './logging.validation'

export function buildLoggingRouter(): Router {
  const router = Router()

  // Receive and store logs from frontend
  router.post(
    '/',
    validateLogRequest,
    asyncHandler(async (req, res) => {
      const result = await loggingController.storeLogs(req)
      res.json(success(result))
    })
  )

  return router
}