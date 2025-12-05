import express from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { generatorRequestRecordSchema } from '@shared/types'
import { buildGeneratorWorkflowRouter } from '../generator.workflow.routes'

const createApp = () => {
  const app = express()
  app.use(express.json())
  app.use('/generator', buildGeneratorWorkflowRouter())
  return app
}

describe('generator contract', () => {
  const app = createApp()

  it('lists requests with shared schema (may be empty)', async () => {
    const res = await request(app).get('/generator/requests')
    expect(res.status).toBe(200)
    const parsed = generatorRequestRecordSchema.array().safeParse(res.body.data.requests)
    if (!parsed.success) {
      console.error(parsed.error.format())
    }
    expect(parsed.success).toBe(true)
  })
})
