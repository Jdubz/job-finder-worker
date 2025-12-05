import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { jobListingRecordSchema, jobListingStatsSchema } from '@shared/types'
import { buildJobListingRouter } from '../job-listing.routes'
import { JobListingRepository } from '../job-listing.repository'
import { getDb } from '../../../db/sqlite'

const createApp = () => {
  const app = express()
  app.use(express.json())
  app.use('/job-listings', buildJobListingRouter())
  return app
}

describe('job listing contract', () => {
  const db = getDb()
  const repo = new JobListingRepository()
  const app = createApp()

  beforeEach(() => {
    db.prepare('DELETE FROM job_matches').run()
    db.prepare('DELETE FROM job_listings').run()
  })

  it('serializes list responses according to shared schema', async () => {
    repo.create({
      id: 'listing-contract-1',
      url: 'https://example.com/jobs/contract-1',
      title: 'Contract Engineer',
      companyName: 'Schema Co',
      description: 'Test listing',
      status: 'pending',
      sourceId: null,
      companyId: null,
      location: null,
      salaryRange: null,
      postedDate: null,
      filterResult: null,
      analysisResult: null,
      matchScore: null
    })

    const res = await request(app).get('/job-listings')

    expect(res.status).toBe(200)
    const parsed = jobListingRecordSchema.array().safeParse(res.body.data.listings)
    if (!parsed.success) {
      console.error(parsed.error.format())
    }
    expect(parsed.success).toBe(true)
  })

  it('serializes stats according to shared schema', async () => {
    repo.create({
      id: 'listing-contract-2',
      url: 'https://example.com/jobs/contract-2',
      title: 'Contract Engineer 2',
      companyName: 'Schema Co',
      description: 'Test listing',
      status: 'pending',
      sourceId: null,
      companyId: null,
      location: null,
      salaryRange: null,
      postedDate: null,
      filterResult: null,
      analysisResult: null,
      matchScore: null
    })

    const res = await request(app).get('/job-listings/stats')

    expect(res.status).toBe(200)
    const parsed = jobListingStatsSchema.safeParse(res.body.data.stats)
    if (!parsed.success) {
      console.error(parsed.error.format())
    }
    expect(parsed.success).toBe(true)
  })
})
