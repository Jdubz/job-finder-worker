import express from 'express'
import request from 'supertest'
import { describe, expect, it, vi, beforeAll } from 'vitest'
import { generatorStepResponseSchema } from '@shared/types'

vi.mock('../workflow/generator.workflow.service', () => {
  return {
    GeneratorWorkflowService: class MockService {
      async createRequest() {
        return { requestId: 'req-1', steps: [{ id: 's1' }] }
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
    },
  }
})

const buildRouter = async () => {
  const { buildGeneratorWorkflowRouter } = await import('../generator.workflow.routes')
  const app = express()
  app.use(express.json())
  app.use('/generator', buildGeneratorWorkflowRouter())
  return app
}

describe('generator step contract (mocked service)', () => {
  let app: express.Express

  beforeAll(async () => {
    app = await buildRouter()
  })

  it('responds with shared schema on step', async () => {
    const startRes = await request(app).post('/generator/start').send({
      generateType: 'resume',
      job: { role: 'Engineer', company: 'Contract Co', jobDescriptionUrl: 'https://example.com' },
    })
    expect(startRes.status).toBe(200)
    const requestId = startRes.body.data.requestId as string

    const stepRes = await request(app).post(`/generator/step/${requestId}`)
    expect(stepRes.status).toBe(200)
    const parsed = generatorStepResponseSchema.safeParse(stepRes.body.data)
    if (!parsed.success) {
      console.error(parsed.error.format())
    }
    expect(parsed.success).toBe(true)
  })
})
