import type { Request, Response } from 'express'

export function healthHandler(_req: Request, res: Response): void {
  res.json({
    status: 'ok',
    service: 'job-finder-api',
    timestamp: new Date().toISOString()
  })
}
