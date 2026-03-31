import { beforeEach, describe, expect, it } from 'vitest'
import { ApplicationEmailRepository } from '../application-email.repository'
import { JobMatchRepository } from '../../job-matches/job-match.repository'
import { JobListingRepository } from '../../job-listings/job-listing.repository'
import { getDb } from '../../../db/sqlite'
import { buildJobMatchInput, buildJobListingRecord } from '../../job-matches/__tests__/fixtures'

describe('ApplicationEmailRepository', () => {
  const repo = new ApplicationEmailRepository()
  const matchRepo = new JobMatchRepository()
  const listingRepo = new JobListingRepository()
  const db = getDb()

  let testMatchId: string

  beforeEach(() => {
    db.prepare('DELETE FROM application_emails').run()
    db.prepare('DELETE FROM job_matches').run()
    db.prepare("DELETE FROM job_listings WHERE id != '__ghost_listing__'").run()

    // Create a real match for FK constraints
    listingRepo.create(buildJobListingRecord({ id: 'email-listing' }))
    const match = matchRepo.upsert(buildJobMatchInput({
      queueItemId: 'email-q', jobListingId: 'email-listing', status: 'applied'
    }))
    testMatchId = match.id!
  })

  const baseInput = {
    gmailMessageId: 'msg-001',
    gmailThreadId: 'thread-001',
    gmailEmail: 'user@gmail.com',
    sender: 'hr@acme.com',
    senderDomain: 'acme.com',
    subject: 'Application Received',
    receivedAt: '2025-03-01T12:00:00Z',
    snippet: 'Thank you for applying',
    bodyPreview: 'Thank you for applying to our position.',
    classification: 'acknowledged' as const,
    classificationConfidence: 80,
    matchConfidence: 75,
    matchSignals: { companyDomainMatch: true, temporalProximity: 10 },
    autoLinked: true
  }

  it('creates and retrieves an application email', () => {
    const created = repo.create(baseInput)

    expect(created.id).toBeDefined()
    expect(created.gmailMessageId).toBe('msg-001')
    expect(created.sender).toBe('hr@acme.com')
    expect(created.classification).toBe('acknowledged')
    expect(created.classificationConfidence).toBe(80)
    expect(created.autoLinked).toBe(true)
    expect(created.matchSignals).toEqual({ companyDomainMatch: true, temporalProximity: 10 })

    const fetched = repo.getById(created.id)
    expect(fetched).not.toBeNull()
    expect(fetched!.gmailMessageId).toBe('msg-001')
  })

  it('retrieves by gmail message id', () => {
    repo.create(baseInput)

    const fetched = repo.getByGmailMessageId('msg-001')
    expect(fetched).not.toBeNull()
    expect(fetched!.sender).toBe('hr@acme.com')
  })

  it('returns null for nonexistent gmail message id', () => {
    expect(repo.getByGmailMessageId('nonexistent')).toBeNull()
  })

  it('checks if a message has been processed', () => {
    expect(repo.isProcessed('msg-001')).toBe(false)

    repo.create(baseInput)

    expect(repo.isProcessed('msg-001')).toBe(true)
  })

  it('prevents duplicate gmail_message_id', () => {
    repo.create(baseInput)

    expect(() => repo.create(baseInput)).toThrow()
  })

  it('creates unlinked emails (null job_match_id)', () => {
    const created = repo.create({ ...baseInput, jobMatchId: null })

    expect(created.jobMatchId).toBeNull()
  })

  it('lists unlinked emails', () => {
    repo.create({ ...baseInput, gmailMessageId: 'msg-unlinked-1', jobMatchId: null })
    repo.create({ ...baseInput, gmailMessageId: 'msg-unlinked-2', jobMatchId: null })
    repo.create({ ...baseInput, gmailMessageId: 'msg-linked-1', jobMatchId: testMatchId })

    const unlinked = repo.listUnlinked()
    expect(unlinked).toHaveLength(2)
  })

  it('links an email to a match', () => {
    const created = repo.create({ ...baseInput, jobMatchId: null })
    expect(created.jobMatchId).toBeNull()

    const updated = repo.linkToMatch(created.id, testMatchId)
    expect(updated).not.toBeNull()
    expect(updated!.jobMatchId).toBe(testMatchId)
  })

  it('unlinks an email from a match', () => {
    const created = repo.create({ ...baseInput, jobMatchId: testMatchId })
    expect(created.jobMatchId).toBe(testMatchId)

    const updated = repo.unlinkFromMatch(created.id)
    expect(updated).not.toBeNull()
    expect(updated!.jobMatchId).toBeNull()
  })

  it('updates classification', () => {
    const created = repo.create(baseInput)
    expect(created.classification).toBe('acknowledged')

    repo.updateClassification(created.id, 'interviewing', 90)

    const fetched = repo.getById(created.id)
    expect(fetched!.classification).toBe('interviewing')
    expect(fetched!.classificationConfidence).toBe(90)
  })

  it('lists all with pagination', () => {
    for (let i = 0; i < 5; i++) {
      repo.create({
        ...baseInput,
        gmailMessageId: `msg-page-${i}`,
        receivedAt: new Date(2025, 0, i + 1).toISOString()
      })
    }

    const page1 = repo.listAll({ limit: 2, offset: 0 })
    expect(page1).toHaveLength(2)

    const page2 = repo.listAll({ limit: 2, offset: 2 })
    expect(page2).toHaveLength(2)

    const page3 = repo.listAll({ limit: 2, offset: 4 })
    expect(page3).toHaveLength(1)
  })
})
