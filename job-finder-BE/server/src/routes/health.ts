import type { Request, Response } from 'express'
import { isReady } from '../modules/lifecycle/lifecycle.stream'

export function healthHandler(_req: Request, res: Response): void {
  const ready = isReady()
  const body = {
    status: ready ? 'ok' : 'draining',
    service: 'job-finder-api',
    timestamp: new Date().toISOString()
  }

  if (!ready) {
    res.status(503).json(body)
    return
  }

  res.json(body)
}
