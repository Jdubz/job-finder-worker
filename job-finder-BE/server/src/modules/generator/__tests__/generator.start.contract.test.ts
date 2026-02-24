import express from 'express'
import request from 'supertest'
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { generatorStartResponseSchema } from '@shared/types'
import { buildGeneratorWorkflowRouter, _setGeneratorWorkflowServiceForTests } from '../generator.workflow.routes'

class MockService {
  async createRequest() {
    return {
      requestId: 'req-123',
      steps: [{ id: 's1' }],
    }
  }
  async runNextStep() {
    return {
      status: 'completed',
      steps: [{ id: 's1', status: 'completed' }],
      nextStep: null,
      resumeUrl: 'https://example.com/resume.pdf',
      coverLetterUrl: null,
    }
  }
}

const createApp = () => {
  const app = express()
  app.use(express.json())
  app.use('/generator', buildGeneratorWorkflowRouter())
  return app
}

describe('generator start contract', () => {
  let app: express.Express

  beforeAll(() => {
    _setGeneratorWorkflowServiceForTests(new MockService() as any)
    app = createApp()
  })

  afterAll(() => {
    _setGeneratorWorkflowServiceForTests(null as any)
  })

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

  it('accepts null for optional job fields (DB rows with NULL columns)', async () => {
    const res = await request(app).post('/generator/start').send({
      generateType: 'resume',
      job: {
        role: 'Engineer',
        company: 'Null Fields Co',
        location: null,
        companyWebsite: null,
        jobDescriptionUrl: null,
        jobDescriptionText: null,
      },
      jobMatchId: null,
      date: null,
    })
    expect(res.status).toBe(200)
  })
})
