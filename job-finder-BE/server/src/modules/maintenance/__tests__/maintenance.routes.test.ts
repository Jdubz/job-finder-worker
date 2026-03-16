import { beforeEach, describe, expect, it, vi } from 'vitest'
import express from 'express'
import request from 'supertest'
import { buildMaintenanceRouter } from '../maintenance.routes'

// Mock MaintenanceService
vi.mock('../maintenance.service', () => ({
  MaintenanceService: vi.fn().mockImplementation(() => ({
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
  }))
}))

describe('Maintenance Routes', () => {
  let app: express.Express

  beforeEach(() => {
    vi.clearAllMocks()
    app = express()
    app.use(express.json())
    app.use('/maintenance', buildMaintenanceRouter())
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
})
