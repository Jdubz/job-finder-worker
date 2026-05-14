import { beforeEach, describe, expect, it, vi } from 'vitest'
import express from 'express'
import request from 'supertest'
import { buildMaintenanceRouter } from '../maintenance.routes'
import type { MaintenanceService } from '../maintenance.service'
import type { FreshnessService } from '../freshness.service'

vi.mock('../../../logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}))

describe('Maintenance Routes', () => {
  let app: express.Express
  let maintenanceMock: { runMaintenance: ReturnType<typeof vi.fn>; getStats: ReturnType<typeof vi.fn> }
  let freshnessMock: { run: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    maintenanceMock = {
      runMaintenance: vi.fn().mockReturnValue({
        success: true,
        archivedQueueItems: 5,
        archivedListings: 3,
        prunedCacheEntries: 2
      }),
      getStats: vi.fn().mockReturnValue({
        archivedQueueItems: 100,
        archivedListings: 50
      })
    }
    freshnessMock = {
      run: vi.fn().mockResolvedValue({
        success: true,
        checked: 12,
        stillLive: 10,
        notFound: 1,
        redirected: 1,
        unknown: 0,
        autoIgnored: 2
      })
    }
    app = express()
    app.use(express.json())
    app.use(
      '/maintenance',
      buildMaintenanceRouter({
        maintenanceService: maintenanceMock as unknown as MaintenanceService,
        freshnessService: freshnessMock as unknown as FreshnessService
      })
    )
  })

  describe('POST /maintenance/run', () => {
    it('triggers maintenance and returns results', async () => {
      const res = await request(app).post('/maintenance/run')

      expect(res.status).toBe(200)
      expect(res.body.data).toEqual({
        success: true,
        archivedQueueItems: 5,
        archivedListings: 3,
        prunedCacheEntries: 2
      })
    })
  })

  describe('GET /maintenance/stats', () => {
    it('returns archive statistics', async () => {
      const res = await request(app).get('/maintenance/stats')

      expect(res.status).toBe(200)
      expect(res.body.data).toEqual({
        archivedQueueItems: 100,
        archivedListings: 50
      })
    })
  })

  describe('POST /maintenance/freshness', () => {
    it('returns 202 and starts the freshness run in the background', async () => {
      let resolveRun: (value: unknown) => void = () => {}
      const pending = new Promise((resolve) => { resolveRun = resolve })
      freshnessMock.run.mockReturnValueOnce(pending)

      const res = await request(app).post('/maintenance/freshness')

      expect(res.status).toBe(202)
      expect(res.body.data).toEqual({ accepted: true, message: 'Freshness run started in background' })
      expect(freshnessMock.run).toHaveBeenCalledTimes(1)

      // Resolve the pending promise so the background work doesn't leak.
      resolveRun({ success: true, checked: 0, stillLive: 0, notFound: 0, redirected: 0, unknown: 0, autoIgnored: 0 })
      await pending
    })

    it('still returns 202 even if the run rejects (errors only land in logs)', async () => {
      // Defer the rejection so the route's .catch attaches before it lands.
      freshnessMock.run.mockImplementationOnce(() =>
        Promise.resolve().then(() => {
          throw new Error('boom')
        })
      )

      const res = await request(app).post('/maintenance/freshness')

      expect(res.status).toBe(202)
    })
  })
})
