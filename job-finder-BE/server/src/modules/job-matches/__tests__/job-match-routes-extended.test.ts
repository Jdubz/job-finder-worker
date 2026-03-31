import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { buildJobMatchRouter } from '../job-match.routes'
import { JobMatchRepository } from '../job-match.repository'
import { JobListingRepository } from '../../job-listings/job-listing.repository'
import { ApplicationEmailRepository } from '../../gmail/application-email.repository'
import { StatusHistoryRepository } from '../../gmail/status-history.repository'
import { getDb } from '../../../db/sqlite'
import { buildJobMatchInput } from './fixtures'
import { apiErrorHandler } from '../../../middleware/api-error'

const createApp = () => {
  const app = express()
  app.use(express.json())
  app.use('/job-matches', buildJobMatchRouter())
  app.use(apiErrorHandler)
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

describe('job match routes — extended statuses', () => {
  const db = getDb()
  const repo = new JobMatchRepository()
  const app = createApp()

  // Ensure ghost sentinel listing exists
  const ensureGhostListing = () => {
    db.prepare(`
      INSERT OR IGNORE INTO job_listings (id, url, title, company_name, description, status, created_at, updated_at)
      VALUES ('__ghost_listing__', '', 'Ghost Listing (system)', 'N/A', 'Sentinel row for ghost matches', 'matched', datetime('now'), datetime('now'))
    `).run()
  }

  beforeEach(() => {
    db.prepare('DELETE FROM application_status_history').run()
    db.prepare('DELETE FROM application_emails').run()
    db.prepare('DELETE FROM job_matches').run()
    db.prepare("DELETE FROM job_listings WHERE id != '__ghost_listing__'").run()
    ensureGhostListing()
  })

  describe('PATCH /:id/status — new statuses', () => {
    it('transitions to acknowledged', async () => {
      createTestListing('l-r1')
      const match = repo.upsert(buildJobMatchInput({ queueItemId: 'q-r1', jobListingId: 'l-r1', status: 'applied' }))

      const res = await request(app)
        .patch(`/job-matches/${match.id}/status`)
        .send({ status: 'acknowledged' })

      expect(res.status).toBe(200)
      expect(res.body.data.match.status).toBe('acknowledged')
    })

    it('transitions to interviewing with a note', async () => {
      createTestListing('l-r2')
      const match = repo.upsert(buildJobMatchInput({ queueItemId: 'q-r2', jobListingId: 'l-r2', status: 'applied' }))

      const res = await request(app)
        .patch(`/job-matches/${match.id}/status`)
        .send({ status: 'interviewing', statusNote: 'Final round Thursday' })

      expect(res.status).toBe(200)
      expect(res.body.data.match.status).toBe('interviewing')
      expect(res.body.data.match.statusNote).toBe('Final round Thursday')
    })

    it('transitions to denied', async () => {
      createTestListing('l-r3')
      const match = repo.upsert(buildJobMatchInput({ queueItemId: 'q-r3', jobListingId: 'l-r3', status: 'interviewing' }))

      const res = await request(app)
        .patch(`/job-matches/${match.id}/status`)
        .send({ status: 'denied' })

      expect(res.status).toBe(200)
      expect(res.body.data.match.status).toBe('denied')
    })

    it('rejects invalid status with error response', async () => {
      createTestListing('l-r4')
      const match = repo.upsert(buildJobMatchInput({ queueItemId: 'q-r4', jobListingId: 'l-r4' }))

      const res = await request(app)
        .patch(`/job-matches/${match.id}/status`)
        .send({ status: 'banana' })

      // Zod validation errors are caught by the error handler
      expect(res.status).toBeGreaterThanOrEqual(400)
      expect(res.body.success).toBe(false)
    })

    it('returns 404 for nonexistent match', async () => {
      const res = await request(app)
        .patch('/job-matches/nonexistent/status')
        .send({ status: 'applied' })

      expect(res.status).toBe(404)
    })
  })

  describe('POST /ghost — ghost match creation', () => {
    it('creates a ghost match', async () => {
      const res = await request(app)
        .post('/job-matches/ghost')
        .send({
          company: 'Startup Inc',
          title: 'Senior Developer',
          url: 'https://startup.com/careers',
          notes: 'Applied via LinkedIn'
        })

      expect(res.status).toBe(201)
      expect(res.body.data.match.isGhost).toBe(true)
      expect(res.body.data.match.ghostCompany).toBe('Startup Inc')
      expect(res.body.data.match.ghostTitle).toBe('Senior Developer')
      expect(res.body.data.match.status).toBe('applied')
    })

    it('creates ghost match with minimum fields', async () => {
      const res = await request(app)
        .post('/job-matches/ghost')
        .send({ company: 'MinCo', title: 'Dev' })

      expect(res.status).toBe(201)
      expect(res.body.data.match.ghostCompany).toBe('MinCo')
    })

    it('rejects ghost match without company', async () => {
      const res = await request(app)
        .post('/job-matches/ghost')
        .send({ title: 'Dev' })

      expect(res.status).toBeGreaterThanOrEqual(400)
      expect(res.body.success).toBe(false)
    })

    it('rejects ghost match without title', async () => {
      const res = await request(app)
        .post('/job-matches/ghost')
        .send({ company: 'Co' })

      expect(res.status).toBeGreaterThanOrEqual(400)
      expect(res.body.success).toBe(false)
    })

    it('rejects ghost match with invalid URL', async () => {
      const res = await request(app)
        .post('/job-matches/ghost')
        .send({ company: 'Co', title: 'Dev', url: 'not-a-url' })

      expect(res.status).toBeGreaterThanOrEqual(400)
      expect(res.body.success).toBe(false)
    })
  })

  describe('GET /:id/emails — application emails', () => {
    it('returns emails linked to a match', async () => {
      createTestListing('l-email')
      const match = repo.upsert(buildJobMatchInput({ queueItemId: 'q-email', jobListingId: 'l-email' }))

      const emailRepo = new ApplicationEmailRepository()
      emailRepo.create({
        jobMatchId: match.id!,
        gmailMessageId: 'gmail-msg-1',
        gmailEmail: 'user@gmail.com',
        sender: 'hr@company.com',
        receivedAt: new Date().toISOString(),
        classification: 'acknowledged',
        classificationConfidence: 80,
        autoLinked: true
      })

      const res = await request(app).get(`/job-matches/${match.id}/emails`)

      expect(res.status).toBe(200)
      expect(res.body.data.emails).toHaveLength(1)
      expect(res.body.data.emails[0].classification).toBe('acknowledged')
    })

    it('returns empty array for match with no emails', async () => {
      createTestListing('l-noemail')
      const match = repo.upsert(buildJobMatchInput({ queueItemId: 'q-noemail', jobListingId: 'l-noemail' }))

      const res = await request(app).get(`/job-matches/${match.id}/emails`)

      expect(res.status).toBe(200)
      expect(res.body.data.emails).toHaveLength(0)
    })
  })

  describe('GET /:id/status-history', () => {
    it('returns status history for a match', async () => {
      createTestListing('l-hist')
      const match = repo.upsert(buildJobMatchInput({ queueItemId: 'q-hist', jobListingId: 'l-hist', status: 'applied' }))

      const historyRepo = new StatusHistoryRepository()
      historyRepo.record({
        jobMatchId: match.id!,
        fromStatus: 'active',
        toStatus: 'applied',
        changedBy: 'user'
      })
      historyRepo.record({
        jobMatchId: match.id!,
        fromStatus: 'applied',
        toStatus: 'acknowledged',
        changedBy: 'email_tracker'
      })

      const res = await request(app).get(`/job-matches/${match.id}/status-history`)

      expect(res.status).toBe(200)
      expect(res.body.data.history).toHaveLength(2)
      expect(res.body.data.history[0].toStatus).toBe('applied')
      expect(res.body.data.history[1].toStatus).toBe('acknowledged')
    })
  })

  describe('GET / — status filter with new statuses', () => {
    it('filters by acknowledged', async () => {
      createTestListing('l-filt1')
      createTestListing('l-filt2')
      const m1 = repo.upsert(buildJobMatchInput({ queueItemId: 'q-f1', jobListingId: 'l-filt1', status: 'applied' }))
      repo.upsert(buildJobMatchInput({ queueItemId: 'q-f2', jobListingId: 'l-filt2', status: 'active' }))
      repo.updateStatus(m1.id!, 'acknowledged')

      const res = await request(app).get('/job-matches?status=acknowledged')

      expect(res.status).toBe(200)
      expect(res.body.data.matches).toHaveLength(1)
      expect(res.body.data.matches[0].status).toBe('acknowledged')
    })

    it('filters by interviewing', async () => {
      createTestListing('l-filt3')
      const m = repo.upsert(buildJobMatchInput({ queueItemId: 'q-f3', jobListingId: 'l-filt3', status: 'applied' }))
      repo.updateStatus(m.id!, 'interviewing')

      const res = await request(app).get('/job-matches?status=interviewing')

      expect(res.status).toBe(200)
      expect(res.body.data.matches).toHaveLength(1)
    })

    it('filters by denied', async () => {
      createTestListing('l-filt4')
      const m = repo.upsert(buildJobMatchInput({ queueItemId: 'q-f4', jobListingId: 'l-filt4', status: 'applied' }))
      repo.updateStatus(m.id!, 'denied')

      const res = await request(app).get('/job-matches?status=denied')

      expect(res.status).toBe(200)
      expect(res.body.data.matches).toHaveLength(1)
    })
  })
})
