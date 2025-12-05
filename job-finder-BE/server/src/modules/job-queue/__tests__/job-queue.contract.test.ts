import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { queueItemSchema, queueStatsSchema } from '@shared/types'
import { buildJobQueueRouter } from '../job-queue.routes'
import { getDb } from '../../../db/sqlite'

const createApp = () => {
  const app = express()
  app.use(express.json())
  app.use('/queue', buildJobQueueRouter())
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
})
