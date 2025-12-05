import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { jobMatchStatsSchema, jobMatchWithListingSchema } from '@shared/types'
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

describe('job match contract', () => {
  const db = getDb()
  const repo = new JobMatchRepository()
  const app = createApp()

  beforeEach(() => {
    db.prepare('DELETE FROM job_matches').run()
    db.prepare('DELETE FROM job_listings').run()
  })

  it('serializes list responses according to shared schema', async () => {
    createTestListing('listing-contract-1')
    repo.upsert(buildJobMatchInput({
      queueItemId: 'queue-contract-1',
      jobListingId: 'listing-contract-1',
      matchScore: 88,
    }))

    const res = await request(app).get('/job-matches')

    expect(res.status).toBe(200)
    const parsed = jobMatchWithListingSchema.array().safeParse(res.body.data.matches)
    if (!parsed.success) {
      console.error(parsed.error.format())
    }
    expect(parsed.success).toBe(true)
  })

  it('serializes stats according to shared schema', async () => {
    createTestListing('listing-contract-2')
    repo.upsert(buildJobMatchInput({ queueItemId: 'queue-contract-2', jobListingId: 'listing-contract-2', matchScore: 92 }))

    const res = await request(app).get('/job-matches/stats')

    expect(res.status).toBe(200)
    const parsed = jobMatchStatsSchema.safeParse(res.body.data.stats)
    if (!parsed.success) {
      console.error(parsed.error.format())
    }
    expect(parsed.success).toBe(true)
  })
})
