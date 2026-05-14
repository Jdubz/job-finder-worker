import { Router } from 'express'
import { asyncHandler } from '../../utils/async-handler'
import { success } from '../../utils/api-response'
import { logger } from '../../logger'
import { MaintenanceService } from './maintenance.service'
import { FreshnessService } from './freshness.service'

export function buildMaintenanceRouter(deps: {
  maintenanceService?: MaintenanceService
  freshnessService?: FreshnessService
} = {}) {
  const router = Router()
  const service = deps.maintenanceService ?? new MaintenanceService()
  const freshness = deps.freshnessService ?? new FreshnessService()

  // POST /api/maintenance/run - Trigger maintenance manually
  router.post(
    '/run',
    asyncHandler(async (_req, res) => {
      const result = await service.runMaintenance()
      res.json(success(result))
    })
  )

  // GET /api/maintenance/stats - Get archive statistics
  router.get(
    '/stats',
    asyncHandler(async (_req, res) => {
      const stats = service.getStats()
      res.json(success(stats))
    })
  )

  // POST /api/maintenance/freshness — fire-and-forget. A run can take several
  // minutes at default batch size, longer than typical proxy/client timeouts,
  // so we return 202 immediately and log the outcome when the run finishes.
  router.post(
    '/freshness',
    asyncHandler(async (_req, res) => {
      void freshness
        .run()
        .then((result) => logger.info({ result }, 'Background freshness run completed'))
        .catch((error) => logger.error({ error }, 'Background freshness run failed'))
      res.status(202).json(success({ accepted: true, message: 'Freshness run started in background' }))
    })
  )

  return router
}
