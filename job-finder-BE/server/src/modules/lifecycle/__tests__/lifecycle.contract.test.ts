import express from 'express'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../lifecycle.stream', () => ({
  handleLifecycleEventsSse: (_req: express.Request, res: express.Response) => {
    res.setHeader('Content-Type', 'text/event-stream')
    res.write('id:1\nevent:status\ndata:{}\n\n')
    res.end()
  },
}))

const buildRouter = async () => {
  const { buildLifecycleRouter } = await import('../lifecycle.routes')
  const app = express()
  app.use('/lifecycle', buildLifecycleRouter())
  return app
}

describe('lifecycle SSE contract (mocked stream)', () => {
  it('exposes SSE endpoint with correct content type', async () => {
    const app = await buildRouter()
    const res = await request(app).get('/lifecycle/events')
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('text/event-stream')
    expect(res.text).toContain('event:status')
  })
})
