import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { buildGeneratorWorkflowRouter } from '../generator.workflow.routes'
import { GeneratorWorkflowRepository } from '../generator.workflow.repository'
import { getDb } from '../../../db/sqlite'

const createApp = () => {
  const app = express()
  app.use(express.json())
  app.use('/generator', buildGeneratorWorkflowRouter())
  return app
}

describe('GET /job-matches/:id/documents', () => {
  const app = createApp()
  const repo = new GeneratorWorkflowRepository()
  const db = getDb()

  beforeEach(() => {
    db.prepare('DELETE FROM generator_artifacts').run()
    db.prepare('DELETE FROM generator_requests').run()
  })

  it('returns only documents tied to the specified job match', async () => {
    const matchA = 'match-a'
    const matchB = 'match-b'

    // Seed requests for two matches
    repo.createRequest({
      id: 'req-a',
      generateType: 'resume',
      job: { role: 'Engineer', company: 'A' },
      preferences: null,
      personalInfo: null,
      status: 'completed',
      resumeUrl: '/files/a.pdf',
      coverLetterUrl: null,
      jobMatchId: matchA,
      createdBy: null,
      steps: null
    })
    repo.createRequest({
      id: 'req-b',
      generateType: 'resume',
      job: { role: 'Engineer', company: 'B' },
      preferences: null,
      personalInfo: null,
      status: 'completed',
      resumeUrl: '/files/b.pdf',
      coverLetterUrl: null,
      jobMatchId: matchB,
      createdBy: null,
      steps: null
    })

    const res = await request(app).get(`/generator/job-matches/${matchA}/documents`)

    expect(res.status).toBe(200)
    expect(res.body.data.requests).toHaveLength(1)
    expect(res.body.data.requests[0].id).toBe('req-a')
  })
})
