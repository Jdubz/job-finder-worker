import express from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { structuredLogEntrySchema } from '@shared/types'
import { buildLoggingRouter } from '../logging.routes'

const createApp = () => {
  const app = express()
  app.use(express.json())
  app.use('/logging', buildLoggingRouter())
  return app
}

describe('logging contract', () => {
  const app = createApp()

  it('accepts log payload matching shared schema', async () => {
    const logs = [
      {
        category: 'client',
        action: 'testing',
        message: 'contract log',
      },
    ]
    // validate before sending
    const parsed = structuredLogEntrySchema.array().safeParse(logs)
    expect(parsed.success).toBe(true)

    const res = await request(app).post('/logging').send({
      logs,
      service: 'contract-test',
      sessionId: 'session-123',
    })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })
})
