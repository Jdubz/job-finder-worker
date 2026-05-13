import { Router } from 'express'
import { asyncHandler } from '../../utils/async-handler'
import { success } from '../../utils/api-response'
import { MaintenanceService } from './maintenance.service'
import { FreshnessService } from './freshness.service'

export function buildMaintenanceRouter() {
  const router = Router()
  const service = new MaintenanceService()
  const freshness = new FreshnessService()

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

  // POST /api/maintenance/freshness - Re-verify matched listings are still live
  router.post(
    '/freshness',
    asyncHandler(async (_req, res) => {
      const result = await freshness.run()
      res.json(success(result))
    })
  )

  return router
}
