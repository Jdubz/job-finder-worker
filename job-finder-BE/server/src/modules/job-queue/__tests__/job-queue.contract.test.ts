import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { ApiErrorCode, queueItemSchema, queueStatsSchema } from '@shared/types'
import { buildJobQueueRouter } from '../job-queue.routes'
import { getDb } from '../../../db/sqlite'
import { apiErrorHandler } from '../../../middleware/api-error'

const createApp = () => {
  const app = express()
  app.use(express.json())
  app.use('/queue', buildJobQueueRouter())
  app.use(apiErrorHandler)
  return app
}

describe('job queue contract', () => {
  const db = getDb()
  const app = createApp()

  beforeEach(() => {
    db.prepare('DELETE FROM job_queue').run()
  })

  it('serializes list responses according to shared schema', async () => {
    const submitRes = await request(app).post('/queue/jobs').send({
      url: 'https://example.com/queue-contract',
      companyName: 'Queue Co',
    })

    expect(submitRes.status).toBe(201)

    const res = await request(app).get('/queue?limit=5')
    expect(res.status).toBe(200)
    const parsed = queueItemSchema.array().safeParse(res.body.data.items)
    if (!parsed.success) {
      console.error(parsed.error.format())
    }
    expect(parsed.success).toBe(true)
  })

  it('serializes stats according to shared schema', async () => {
    const res = await request(app).get('/queue/stats')
    expect(res.status).toBe(200)
    const parsed = queueStatsSchema.safeParse(res.body.data.stats)
    if (!parsed.success) {
      console.error(parsed.error.format())
    }
    expect(parsed.success).toBe(true)
  })

  describe('company submission duplicate prevention', () => {
    it('returns 409 ALREADY_EXISTS when a pending company task exists', async () => {
      // First submission should succeed
      const firstRes = await request(app).post('/queue/companies').send({
        companyName: 'Test Corp',
        companyId: 'company-duplicate-test',
        websiteUrl: 'https://testcorp.com'
      })
      expect(firstRes.status).toBe(201)

      // Second submission for same company should fail
      const secondRes = await request(app).post('/queue/companies').send({
        companyName: 'Test Corp',
        companyId: 'company-duplicate-test',
        websiteUrl: 'https://testcorp.com'
      })
      expect(secondRes.status).toBe(409)
      expect(secondRes.body.error.code).toBe(ApiErrorCode.ALREADY_EXISTS)
      expect(secondRes.body.error.message).toContain('already in the queue')
    })

    it('returns 409 ALREADY_EXISTS when a processing company task exists', async () => {
      // Create a task and set it to processing
      const firstRes = await request(app).post('/queue/companies').send({
        companyName: 'Processing Corp',
        companyId: 'company-processing-test',
        websiteUrl: 'https://processingcorp.com'
      })
      expect(firstRes.status).toBe(201)

      // Update to processing status
      db.prepare('UPDATE job_queue SET status = ? WHERE id = ?').run(
        'processing',
        firstRes.body.data.queueItem.id
      )

      // Second submission should fail
      const secondRes = await request(app).post('/queue/companies').send({
        companyName: 'Processing Corp',
        companyId: 'company-processing-test',
        websiteUrl: 'https://processingcorp.com'
      })
      expect(secondRes.status).toBe(409)
      expect(secondRes.body.error.code).toBe(ApiErrorCode.ALREADY_EXISTS)
    })

    it('allows submission when companyId is not provided', async () => {
      // First submission without companyId
      const firstRes = await request(app).post('/queue/companies').send({
        companyName: 'New Corp',
        websiteUrl: 'https://newcorp1.com'
      })
      expect(firstRes.status).toBe(201)

      // Second submission without companyId but different URL should succeed
      // (no duplicate check on company_id when it's not provided)
      const secondRes = await request(app).post('/queue/companies').send({
        companyName: 'New Corp',
        websiteUrl: 'https://newcorp2.com'
      })
      expect(secondRes.status).toBe(201)
    })

    it('allows submission when previous task is successful', async () => {
      // Create a task and mark it successful
      const firstRes = await request(app).post('/queue/companies').send({
        companyName: 'Completed Corp',
        companyId: 'company-completed-test',
        websiteUrl: 'https://completedcorp.com'
      })
      expect(firstRes.status).toBe(201)

      // Update to success status
      db.prepare('UPDATE job_queue SET status = ? WHERE id = ?').run(
        'success',
        firstRes.body.data.queueItem.id
      )

      // Second submission should succeed
      const secondRes = await request(app).post('/queue/companies').send({
        companyName: 'Completed Corp',
        companyId: 'company-completed-test',
        websiteUrl: 'https://completedcorp.com'
      })
      expect(secondRes.status).toBe(201)
    })

    it('allows submission when previous task is failed', async () => {
      // Create a task and fail it
      const firstRes = await request(app).post('/queue/companies').send({
        companyName: 'Failed Corp',
        companyId: 'company-failed-test',
        websiteUrl: 'https://failedcorp.com'
      })
      expect(firstRes.status).toBe(201)

      // Update to failed status
      db.prepare('UPDATE job_queue SET status = ? WHERE id = ?').run(
        'failed',
        firstRes.body.data.queueItem.id
      )

      // Second submission should succeed
      const secondRes = await request(app).post('/queue/companies').send({
        companyName: 'Failed Corp',
        companyId: 'company-failed-test',
        websiteUrl: 'https://failedcorp.com'
      })
      expect(secondRes.status).toBe(201)
    })
  })
})
