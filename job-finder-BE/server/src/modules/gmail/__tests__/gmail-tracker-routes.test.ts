import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { buildGmailRouter } from '../gmail.routes'
import { ApplicationEmailRepository } from '../application-email.repository'
import { JobMatchRepository } from '../../job-matches/job-match.repository'
import { JobListingRepository } from '../../job-listings/job-listing.repository'
import { getDb } from '../../../db/sqlite'
import { apiErrorHandler } from '../../../middleware/api-error'
import { buildJobMatchInput, buildJobListingRecord } from '../../job-matches/__tests__/fixtures'

const createApp = () => {
  const app = express()
  app.use(express.json())
  app.use('/gmail', buildGmailRouter())
  app.use(apiErrorHandler)
  return app
}

describe('gmail tracker routes', () => {
  const db = getDb()
  const emailRepo = new ApplicationEmailRepository()
  const matchRepo = new JobMatchRepository()
  const listingRepo = new JobListingRepository()
  const app = createApp()

  let testMatchId: string

  beforeEach(() => {
    db.prepare('DELETE FROM application_emails').run()
    db.prepare('DELETE FROM job_matches').run()
    db.prepare("DELETE FROM job_listings WHERE id != '__ghost_listing__'").run()

    listingRepo.create(buildJobListingRecord({ id: 'route-listing' }))
    const match = matchRepo.upsert(buildJobMatchInput({
      queueItemId: 'route-q', jobListingId: 'route-listing', status: 'applied'
    }))
    testMatchId = match.id!
  })

  describe('GET /gmail/tracker/emails', () => {
    it('lists all tracked emails', async () => {
      emailRepo.create({
        gmailMessageId: 'msg-route-1',
        gmailEmail: 'user@gmail.com',
        sender: 'hr@co.com',
        receivedAt: new Date().toISOString(),
        classification: 'acknowledged',
        classificationConfidence: 80,
        autoLinked: false
      })

      const res = await request(app).get('/gmail/tracker/emails')

      expect(res.status).toBe(200)
      expect(res.body.data.emails).toHaveLength(1)
    })

    it('supports pagination', async () => {
      for (let i = 0; i < 5; i++) {
        emailRepo.create({
          gmailMessageId: `msg-page-${i}`,
          gmailEmail: 'user@gmail.com',
          sender: 'hr@co.com',
          receivedAt: new Date().toISOString(),
          classification: 'unclassified',
          classificationConfidence: 0,
          autoLinked: false
        })
      }

      const res = await request(app).get('/gmail/tracker/emails?limit=2&offset=0')

      expect(res.status).toBe(200)
      expect(res.body.data.emails).toHaveLength(2)
    })
  })

  describe('GET /gmail/tracker/emails/unlinked', () => {
    it('returns only unlinked emails', async () => {
      emailRepo.create({
        gmailMessageId: 'msg-linked',
        gmailEmail: 'user@gmail.com',
        sender: 'hr@co.com',
        receivedAt: new Date().toISOString(),
        classification: 'acknowledged',
        classificationConfidence: 80,
        autoLinked: true,
        jobMatchId: testMatchId
      })
      emailRepo.create({
        gmailMessageId: 'msg-unlinked',
        gmailEmail: 'user@gmail.com',
        sender: 'hr@other.com',
        receivedAt: new Date().toISOString(),
        classification: 'unclassified',
        classificationConfidence: 0,
        autoLinked: false,
        jobMatchId: null
      })

      const res = await request(app).get('/gmail/tracker/emails/unlinked')

      expect(res.status).toBe(200)
      expect(res.body.data.emails).toHaveLength(1)
      expect(res.body.data.emails[0].gmailMessageId).toBe('msg-unlinked')
    })
  })

  describe('POST /gmail/tracker/emails/:id/link', () => {
    it('links an email to a match', async () => {
      const email = emailRepo.create({
        gmailMessageId: 'msg-to-link',
        gmailEmail: 'user@gmail.com',
        sender: 'hr@co.com',
        receivedAt: new Date().toISOString(),
        classification: 'acknowledged',
        classificationConfidence: 80,
        autoLinked: false,
        jobMatchId: null
      })

      const res = await request(app)
        .post(`/gmail/tracker/emails/${email.id}/link`)
        .send({ matchId: testMatchId })

      expect(res.status).toBe(200)
      expect(res.body.data.email.jobMatchId).toBe(testMatchId)
    })

    it('rejects link without matchId', async () => {
      const email = emailRepo.create({
        gmailMessageId: 'msg-no-matchid',
        gmailEmail: 'user@gmail.com',
        sender: 'hr@co.com',
        receivedAt: new Date().toISOString(),
        classification: 'unclassified',
        classificationConfidence: 0,
        autoLinked: false
      })

      const res = await request(app)
        .post(`/gmail/tracker/emails/${email.id}/link`)
        .send({})

      expect(res.status).toBeGreaterThanOrEqual(400)
      expect(res.body.success).toBe(false)
    })
  })

  describe('POST /gmail/tracker/emails/:id/unlink', () => {
    it('unlinks an email from a match', async () => {
      const email = emailRepo.create({
        gmailMessageId: 'msg-to-unlink',
        gmailEmail: 'user@gmail.com',
        sender: 'hr@co.com',
        receivedAt: new Date().toISOString(),
        classification: 'acknowledged',
        classificationConfidence: 80,
        autoLinked: true,
        jobMatchId: testMatchId
      })

      const res = await request(app)
        .post(`/gmail/tracker/emails/${email.id}/unlink`)

      expect(res.status).toBe(200)
      expect(res.body.data.email.jobMatchId).toBeNull()
    })
  })
})
