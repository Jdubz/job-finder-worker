import express from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { configEntrySchema, configListSchema } from '@shared/types'
import { buildConfigRouter } from '../config.routes'

const createApp = () => {
  const app = express()
  app.use(express.json())
  app.use('/config', buildConfigRouter())
  return app
}

describe('config contract', () => {
  const app = createApp()

  it('lists configs with shared schema', async () => {
    const res = await request(app).get('/config')
    expect(res.status).toBe(200)
    const parsed = configListSchema.safeParse(res.body.data)
    if (!parsed.success) {
      console.error(parsed.error.format())
    }
    expect(parsed.success).toBe(true)
  })

  it('gets ai-settings config with shared schema', async () => {
    const res = await request(app).get('/config/ai-settings')
    expect(res.status).toBe(200)
    const parsed = configEntrySchema.safeParse(res.body.data.config)
    if (!parsed.success) {
      console.error(parsed.error.format())
    }
    expect(parsed.success).toBe(true)
  })
})
