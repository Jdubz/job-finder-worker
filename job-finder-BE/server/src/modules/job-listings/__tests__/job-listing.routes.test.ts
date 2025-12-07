import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { buildJobListingRouter } from '../job-listing.routes'
import { JobListingRepository } from '../job-listing.repository'
import { getDb } from '../../../db/sqlite'

const createApp = () => {
  const app = express()
  app.use(express.json())
  app.use('/job-listings', buildJobListingRouter())
  return app
}

describe('job listing routes', () => {
  const db = getDb()
  const repo = new JobListingRepository()
  const app = createApp()

  beforeEach(() => {
    db.prepare('DELETE FROM job_matches').run()
    db.prepare('DELETE FROM job_listings').run()
  })

  describe('GET /job-listings/stats', () => {
    it('returns aggregated stats by status', async () => {
      // Create listings with different statuses
      repo.create({
        url: 'https://example.com/job1',
        title: 'Engineer 1',
        companyName: 'Company A',
        description: 'Description',
        status: 'pending'
      })
      repo.create({
        url: 'https://example.com/job2',
        title: 'Engineer 2',
        companyName: 'Company B',
        description: 'Description',
        status: 'pending'
      })
      repo.create({
        url: 'https://example.com/job3',
        title: 'Engineer 3',
        companyName: 'Company C',
        description: 'Description',
        status: 'analyzing'
      })
      repo.create({
        url: 'https://example.com/job4',
        title: 'Engineer 4',
        companyName: 'Company D',
        description: 'Description',
        status: 'analyzed'
      })
      repo.create({
        url: 'https://example.com/job5',
        title: 'Engineer 5',
        companyName: 'Company E',
        description: 'Description',
        status: 'matched'
      })
      repo.create({
        url: 'https://example.com/job6',
        title: 'Engineer 6',
        companyName: 'Company F',
        description: 'Description',
        status: 'skipped'
      })

      const res = await request(app).get('/job-listings/stats')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.stats).toBeDefined()
      expect(res.body.data.stats.total).toBe(6)
      expect(res.body.data.stats.pending).toBe(2)
      expect(res.body.data.stats.analyzing).toBe(1)
      expect(res.body.data.stats.analyzed).toBe(1)
      expect(res.body.data.stats.matched).toBe(1)
      expect(res.body.data.stats.skipped).toBe(1)
    })

    it('returns zeros when no listings exist', async () => {
      const res = await request(app).get('/job-listings/stats')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.stats.total).toBe(0)
      expect(res.body.data.stats.pending).toBe(0)
      expect(res.body.data.stats.analyzing).toBe(0)
      expect(res.body.data.stats.analyzed).toBe(0)
      expect(res.body.data.stats.matched).toBe(0)
      expect(res.body.data.stats.skipped).toBe(0)
    })
  })

  describe('GET /job-listings', () => {
    it('lists all job listings', async () => {
      repo.create({
        url: 'https://example.com/job1',
        title: 'Engineer',
        companyName: 'Company',
        description: 'Description',
        status: 'pending'
      })

      const res = await request(app).get('/job-listings')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.listings).toHaveLength(1)
      expect(res.body.data.count).toBe(1)
    })
  })

  describe('POST /job-listings', () => {
    it('returns 409 when creating a listing with duplicate URL', async () => {
      const listingData = {
        url: 'https://example.com/duplicate-job',
        title: 'Engineer',
        companyName: 'Company',
        description: 'Description'
      }

      // First creation should succeed
      const firstRes = await request(app).post('/job-listings').send(listingData)
      expect(firstRes.status).toBe(201)

      // Second creation with same URL should return 409
      const secondRes = await request(app).post('/job-listings').send({
        ...listingData,
        title: 'Different Title'
      })
      expect(secondRes.status).toBe(409)
      expect(secondRes.body.success).toBe(false)
      expect(secondRes.body.error.code).toBe('RESOURCE_CONFLICT')
      expect(secondRes.body.error.message).toContain('URL already exists')
    })
  })
})
