import express from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { generatorStartResponseSchema } from '@shared/types'
import { buildGeneratorWorkflowRouter } from '../generator.workflow.routes'

const createApp = () => {
  const app = express()
  app.use(express.json())
  app.use('/generator', buildGeneratorWorkflowRouter())
  return app
}

describe('generator start contract', () => {
  const app = createApp()

  it('responds with shared schema on start', async () => {
    const res = await request(app).post('/generator/start').send({
      generateType: 'resume',
      job: { role: 'Engineer', company: 'Contract Co', jobDescriptionUrl: 'https://example.com' },
    })
    expect(res.status).toBe(200)
    const parsed = generatorStartResponseSchema.safeParse(res.body.data)
    if (!parsed.success) {
      console.error(parsed.error.format())
    }
    expect(parsed.success).toBe(true)
  })
})
