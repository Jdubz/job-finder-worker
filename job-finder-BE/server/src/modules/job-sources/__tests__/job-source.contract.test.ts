import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { jobSourceSchema, jobSourceStatsSchema } from '@shared/types'
import { buildJobSourceRouter } from '../job-source.routes'
import { JobSourceRepository } from '../job-source.repository'
import { getDb } from '../../../db/sqlite'

const createApp = () => {
  const app = express()
  app.use(express.json())
  app.use('/job-sources', buildJobSourceRouter())
  return app
}

describe('job source contract', () => {
  const db = getDb()
  const repo = new JobSourceRepository()
  const app = createApp()

  beforeEach(() => {
    db.prepare('DELETE FROM job_sources').run()
  })

  it('serializes list responses according to shared schema', async () => {
    repo.create({
      id: 'source-contract-1',
      name: 'Contract Source',
      sourceType: 'rss',
      status: 'active',
      configJson: { url: 'https://example.com/rss' },
      tags: ['contract'],
      companyId: null,
      aggregatorDomain: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastScrapedAt: null
    })

    const res = await request(app).get('/job-sources')
    expect(res.status).toBe(200)
    const parsed = jobSourceSchema.array().safeParse(res.body.data.items)
    if (!parsed.success) {
      console.error(parsed.error.format())
    }
    expect(parsed.success).toBe(true)
  })

  it('serializes stats according to shared schema', async () => {
    const res = await request(app).get('/job-sources/stats')
    expect(res.status).toBe(200)
    const parsed = jobSourceStatsSchema.safeParse(res.body.data.stats)
    if (!parsed.success) {
      console.error(parsed.error.format())
    }
    expect(parsed.success).toBe(true)
  })
})
