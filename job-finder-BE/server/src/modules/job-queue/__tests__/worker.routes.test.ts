import { beforeEach, describe, expect, it, vi } from 'vitest'
import express from 'express'
import request from 'supertest'
import { buildWorkerRouter } from '../worker.routes'

// Mock queue-events module
vi.mock('../queue-events', () => ({
  broadcastQueueEvent: vi.fn(),
  takePendingCommands: vi.fn().mockReturnValue([])
}))

// Mock worker-auth middleware to pass through
vi.mock('../../../middleware/worker-auth', () => ({
  verifyWorkerToken: (_req: any, _res: any, next: any) => next()
}))

import { broadcastQueueEvent, takePendingCommands } from '../queue-events'

describe('Worker Routes', () => {
  let app: express.Express

  beforeEach(() => {
    vi.clearAllMocks()
    app = express()
    app.use(express.json())
    app.use('/worker', buildWorkerRouter())
  })

  describe('GET /worker/commands', () => {
    it('returns empty commands array by default', async () => {
      const res = await request(app).get('/worker/commands')

      expect(res.status).toBe(200)
      expect(res.body.data.commands).toEqual([])
    })

    it('passes workerId query parameter', async () => {
      await request(app).get('/worker/commands?workerId=worker-1')

      expect(takePendingCommands).toHaveBeenCalledWith('worker-1')
    })

    it('defaults workerId to "default"', async () => {
      await request(app).get('/worker/commands')

      expect(takePendingCommands).toHaveBeenCalledWith('default')
    })

    it('returns pending commands when available', async () => {
      const commands = [{ command: 'cancel' as const, itemId: 'item-1', workerId: 'default', ts: '2024-01-01T00:00:00Z' }]
      vi.mocked(takePendingCommands).mockReturnValue(commands)

      const res = await request(app).get('/worker/commands')

      expect(res.body.data.commands).toEqual(commands)
    })
  })

  describe('POST /worker/events', () => {
    it('accepts valid worker events', async () => {
      const res = await request(app)
        .post('/worker/events')
        .send({ event: 'item.created', data: { id: 'item-1' } })

      expect(res.status).toBe(200)
      expect(res.body.data.received).toBe(true)
      expect(broadcastQueueEvent).toHaveBeenCalledWith('item.created', { id: 'item-1' })
    })

    it('accepts heartbeat events', async () => {
      const res = await request(app)
        .post('/worker/events')
        .send({ event: 'heartbeat', data: { ts: '2024-01-01' } })

      expect(res.status).toBe(200)
      expect(broadcastQueueEvent).toHaveBeenCalledWith('heartbeat', { ts: '2024-01-01' })
    })

    it('rejects invalid event names', async () => {
      const res = await request(app)
        .post('/worker/events')
        .send({ event: 'invalid.event', data: {} })

      expect(res.status).toBe(400)
      expect(broadcastQueueEvent).not.toHaveBeenCalled()
    })

    it('rejects missing event name', async () => {
      const res = await request(app)
        .post('/worker/events')
        .send({ data: {} })

      expect(res.status).toBe(400)
    })

    it('defaults data to empty object when not provided', async () => {
      const res = await request(app)
        .post('/worker/events')
        .send({ event: 'item.updated' })

      expect(res.status).toBe(200)
      expect(broadcastQueueEvent).toHaveBeenCalledWith('item.updated', {})
    })
  })
})
