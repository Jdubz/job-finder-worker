import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { buildJobMatchRouter } from '../job-match.routes'
import { JobMatchRepository } from '../job-match.repository'
import { getDb } from '../../../db/sqlite'
import { buildJobMatchInput } from './fixtures'

const createApp = () => {
  const app = express()
  app.use(express.json())
  app.use('/job-matches', buildJobMatchRouter())
  return app
}

describe('job match routes', () => {
  const db = getDb()
  const repo = new JobMatchRepository()
  const app = createApp()

  beforeEach(() => {
    db.prepare('DELETE FROM job_matches').run()
  })

  it('lists matches honoring filters', async () => {
    repo.upsert(buildJobMatchInput({ queueItemId: 'queue-10', companyName: 'Acme Robotics', matchScore: 95 }))
    repo.upsert(buildJobMatchInput({ queueItemId: 'queue-11', companyName: 'Beta Labs', matchScore: 70 }))

    const response = await request(app).get('/job-matches?minScore=90&companyName=acme')

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data.matches).toHaveLength(1)
    expect(response.body.data.matches[0].companyName).toBe('Acme Robotics')
  })

  it('returns a single match or 404', async () => {
    const seeded = repo.upsert(buildJobMatchInput({ queueItemId: 'queue-12' }))

    const found = await request(app).get(`/job-matches/${seeded.id}`)
    expect(found.status).toBe(200)
    expect(found.body.data.match.id).toBe(seeded.id)

    const missing = await request(app).get('/job-matches/missing-id')
    expect(missing.status).toBe(404)
  })

  it('creates matches via POST', async () => {
    const payload = buildJobMatchInput({ queueItemId: 'queue-13', companyName: 'NewCo' })
    const body = { ...payload }
    delete body.id

    const res = await request(app).post('/job-matches').send(body)

    expect(res.status).toBe(201)
    expect(res.body.data.match.companyName).toBe('NewCo')

    const stored = repo.getById(res.body.data.match.id)
    expect(stored?.url).toBe(payload.url)
  })

  it('deletes matches via DELETE', async () => {
    const seeded = repo.upsert(buildJobMatchInput({ queueItemId: 'queue-14' }))

    const res = await request(app).delete(`/job-matches/${seeded.id}`)
    expect(res.status).toBe(200)
    expect(res.body.data.deleted).toBe(true)
    expect(repo.getById(seeded.id!)).toBeNull()
  })
})
