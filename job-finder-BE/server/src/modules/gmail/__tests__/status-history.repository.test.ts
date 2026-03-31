import { beforeEach, describe, expect, it } from 'vitest'
import { StatusHistoryRepository } from '../status-history.repository'
import { ApplicationEmailRepository } from '../application-email.repository'
import { JobMatchRepository } from '../../job-matches/job-match.repository'
import { JobListingRepository } from '../../job-listings/job-listing.repository'
import { getDb } from '../../../db/sqlite'
import { buildJobMatchInput, buildJobListingRecord } from '../../job-matches/__tests__/fixtures'

describe('StatusHistoryRepository', () => {
  const repo = new StatusHistoryRepository()
  const matchRepo = new JobMatchRepository()
  const listingRepo = new JobListingRepository()
  const db = getDb()

  let testMatchId: string

  beforeEach(() => {
    db.prepare('DELETE FROM application_status_history').run()
    db.prepare('DELETE FROM application_emails').run()
    db.prepare('DELETE FROM job_matches').run()
    db.prepare("DELETE FROM job_listings WHERE id != '__ghost_listing__'").run()

    // Create a real match for FK constraints
    listingRepo.create(buildJobListingRecord({ id: 'hist-listing' }))
    const match = matchRepo.upsert(buildJobMatchInput({
      queueItemId: 'hist-q', jobListingId: 'hist-listing', status: 'applied'
    }))
    testMatchId = match.id!
  })

  it('records a status change and retrieves it', () => {
    const entry = repo.record({
      jobMatchId: testMatchId,
      fromStatus: 'applied',
      toStatus: 'acknowledged',
      changedBy: 'email_tracker',
      note: 'Auto-detected from email'
    })

    expect(entry.id).toBeDefined()
    expect(entry.jobMatchId).toBe(testMatchId)
    expect(entry.fromStatus).toBe('applied')
    expect(entry.toStatus).toBe('acknowledged')
    expect(entry.changedBy).toBe('email_tracker')
    expect(entry.note).toBe('Auto-detected from email')
    expect(entry.createdAt).toBeDefined()
  })

  it('retrieves by id', () => {
    const entry = repo.record({
      jobMatchId: testMatchId,
      fromStatus: 'acknowledged',
      toStatus: 'interviewing',
      changedBy: 'user'
    })

    const fetched = repo.getById(entry.id)
    expect(fetched).not.toBeNull()
    expect(fetched!.toStatus).toBe('interviewing')
  })

  it('returns null for nonexistent id', () => {
    expect(repo.getById('nonexistent')).toBeNull()
  })

  it('lists history for a match in chronological order', () => {
    repo.record({
      jobMatchId: testMatchId,
      fromStatus: 'applied',
      toStatus: 'acknowledged',
      changedBy: 'email_tracker'
    })
    repo.record({
      jobMatchId: testMatchId,
      fromStatus: 'acknowledged',
      toStatus: 'interviewing',
      changedBy: 'user'
    })
    // Create a second match to verify filtering
    listingRepo.create(buildJobListingRecord({ id: 'hist-listing-other' }))
    const otherMatch = matchRepo.upsert(buildJobMatchInput({
      queueItemId: 'hist-q-other', jobListingId: 'hist-listing-other', status: 'applied'
    }))
    repo.record({
      jobMatchId: otherMatch.id!,
      fromStatus: 'applied',
      toStatus: 'denied',
      changedBy: 'email_tracker'
    })

    const history = repo.listByJobMatch(testMatchId)
    expect(history).toHaveLength(2)
    expect(history[0].toStatus).toBe('acknowledged')
    expect(history[1].toStatus).toBe('interviewing')
  })

  it('returns empty array for match with no history', () => {
    const history = repo.listByJobMatch('nonexistent')
    expect(history).toHaveLength(0)
  })

  it('records entry with application email reference', () => {
    const appEmailRepo = new ApplicationEmailRepository()
    const appEmail = appEmailRepo.create({
      gmailMessageId: 'hist-msg-1',
      gmailEmail: 'user@gmail.com',
      sender: 'hr@co.com',
      receivedAt: new Date().toISOString(),
      classification: 'denied' as const,
      classificationConfidence: 90,
      autoLinked: true,
      jobMatchId: testMatchId
    })

    const entry = repo.record({
      jobMatchId: testMatchId,
      fromStatus: 'applied',
      toStatus: 'denied',
      changedBy: 'email_tracker',
      applicationEmailId: appEmail.id,
      note: 'Rejection detected'
    })

    expect(entry.applicationEmailId).toBe(appEmail.id)
  })
})
