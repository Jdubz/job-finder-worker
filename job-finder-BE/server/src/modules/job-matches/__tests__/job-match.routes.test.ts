import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { buildJobMatchRouter } from '../job-match.routes'
import { JobMatchRepository } from '../job-match.repository'
import { JobListingRepository } from '../../job-listings/job-listing.repository'
import { getDb } from '../../../db/sqlite'
import { buildJobMatchInput } from './fixtures'

const createApp = () => {
  const app = express()
  app.use(express.json())
  app.use('/job-matches', buildJobMatchRouter())
  return app
}

const createTestListing = (id: string) => {
  const listingRepo = new JobListingRepository()
  return listingRepo.create({
    id,
    url: `https://example.com/jobs/${id}`,
    title: `Engineer ${id}`,
    companyName: `Company ${id}`,
    description: 'Build great products',
    status: 'analyzed'
  })
}

describe('job match routes', () => {
  const db = getDb()
  const repo = new JobMatchRepository()
  const app = createApp()

  beforeEach(() => {
    db.prepare('DELETE FROM job_matches').run()
    db.prepare('DELETE FROM job_listings').run()
  })

  it('lists matches honoring filters', async () => {
    createTestListing('listing-10')
    createTestListing('listing-11')
    repo.upsert(buildJobMatchInput({ queueItemId: 'queue-10', jobListingId: 'listing-10', matchScore: 95 }))
    repo.upsert(buildJobMatchInput({ queueItemId: 'queue-11', jobListingId: 'listing-11', matchScore: 70 }))

    const response = await request(app).get('/job-matches?minScore=90')

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data.matches).toHaveLength(1)
    expect(response.body.data.matches[0].matchScore).toBe(95)
    expect(response.body.data.matches[0].listing.id).toBe('listing-10')
  })

  it('returns a single match or 404', async () => {
    createTestListing('listing-12')
    const seeded = repo.upsert(buildJobMatchInput({ queueItemId: 'queue-12', jobListingId: 'listing-12' }))

    const found = await request(app).get(`/job-matches/${seeded.id}`)
    expect(found.status).toBe(200)
    expect(found.body.data.match.id).toBe(seeded.id)
    expect(found.body.data.match.listing.id).toBe('listing-12')

    const missing = await request(app).get('/job-matches/missing-id')
    expect(missing.status).toBe(404)
  })

  it('creates matches via POST', async () => {
    createTestListing('listing-13')
    const payload = buildJobMatchInput({ queueItemId: 'queue-13', jobListingId: 'listing-13' })
    const body = { ...payload }
    delete body.id

    const res = await request(app).post('/job-matches').send(body)

    expect(res.status).toBe(201)
    expect(res.body.data.match.jobListingId).toBe('listing-13')

    const stored = repo.getById(res.body.data.match.id)
    expect(stored?.jobListingId).toBe('listing-13')
  })

  it('deletes matches via DELETE', async () => {
    createTestListing('listing-14')
    const seeded = repo.upsert(buildJobMatchInput({ queueItemId: 'queue-14', jobListingId: 'listing-14' }))

    const res = await request(app).delete(`/job-matches/${seeded.id}`)
    expect(res.status).toBe(200)
    expect(res.body.data.deleted).toBe(true)
    expect(repo.getById(seeded.id!)).toBeNull()
  })

  describe('GET /job-matches/stats', () => {
    it('returns aggregated stats from database', async () => {
      // Create listings and matches with different scores
      createTestListing('listing-stats-1')
      createTestListing('listing-stats-2')
      createTestListing('listing-stats-3')
      createTestListing('listing-stats-4')

      // High score (>=80)
      repo.upsert(buildJobMatchInput({ queueItemId: 'queue-stats-1', jobListingId: 'listing-stats-1', matchScore: 95 }))
      repo.upsert(buildJobMatchInput({ queueItemId: 'queue-stats-2', jobListingId: 'listing-stats-2', matchScore: 85 }))
      // Medium score (>=50, <80)
      repo.upsert(buildJobMatchInput({ queueItemId: 'queue-stats-3', jobListingId: 'listing-stats-3', matchScore: 65 }))
      // Low score (<50)
      repo.upsert(buildJobMatchInput({ queueItemId: 'queue-stats-4', jobListingId: 'listing-stats-4', matchScore: 30 }))

      const res = await request(app).get('/job-matches/stats')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.stats).toBeDefined()
      expect(res.body.data.stats.total).toBe(4)
      expect(res.body.data.stats.highScore).toBe(2)
      expect(res.body.data.stats.mediumScore).toBe(1)
      expect(res.body.data.stats.lowScore).toBe(1)
      // Average: (95 + 85 + 65 + 30) / 4 = 68.75
      expect(res.body.data.stats.averageScore).toBe(68.75)
    })

    it('returns zeros when no matches exist', async () => {
      const res = await request(app).get('/job-matches/stats')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.stats.total).toBe(0)
      expect(res.body.data.stats.highScore).toBe(0)
      expect(res.body.data.stats.mediumScore).toBe(0)
      expect(res.body.data.stats.lowScore).toBe(0)
      expect(res.body.data.stats.averageScore).toBe(0)
    })
  })
})
