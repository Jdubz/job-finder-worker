import { Router } from 'express'
import { handleLifecycleEventsSse } from './lifecycle.stream'

export function buildLifecycleRouter() {
  const router = Router()

  // Public SSE endpoint used by the frontend to detect deploy / restart cycles.
  router.get('/events', (req, res) => handleLifecycleEventsSse(req, res))

  return router
}
