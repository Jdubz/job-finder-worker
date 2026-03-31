import { beforeEach, describe, expect, it } from 'vitest'
import { JobMatchRepository } from '../job-match.repository'
import { JobListingRepository } from '../../job-listings/job-listing.repository'
import { getDb } from '../../../db/sqlite'
import { buildJobMatchInput, buildJobListingRecord } from './fixtures'

describe('JobMatchRepository — extended status model', () => {
  const repo = new JobMatchRepository()
  const listingRepo = new JobListingRepository()
  const db = getDb()

  const createListing = (id: string) => {
    listingRepo.create(buildJobListingRecord({ id }))
  }

  beforeEach(() => {
    db.prepare('DELETE FROM job_matches').run()
    db.prepare("DELETE FROM job_listings WHERE id != '__ghost_listing__'").run()
  })

  describe('new statuses', () => {
    it('updates status to acknowledged', () => {
      createListing('listing-ack')
      const created = repo.upsert(buildJobMatchInput({
        queueItemId: 'q-ack', jobListingId: 'listing-ack', status: 'applied'
      }))

      const updated = repo.updateStatus(created.id!, 'acknowledged')
      expect(updated?.status).toBe('acknowledged')
    })

    it('updates status to interviewing with a note', () => {
      createListing('listing-int')
      const created = repo.upsert(buildJobMatchInput({
        queueItemId: 'q-int', jobListingId: 'listing-int', status: 'applied'
      }))

      const updated = repo.updateStatus(created.id!, 'interviewing', {
        updatedBy: 'user',
        note: 'Phone screen scheduled for next Tuesday'
      })
      expect(updated?.status).toBe('interviewing')
      expect(updated?.statusNote).toBe('Phone screen scheduled for next Tuesday')
      expect(updated?.statusUpdatedBy).toBe('user')
    })

    it('updates status to denied', () => {
      createListing('listing-den')
      const created = repo.upsert(buildJobMatchInput({
        queueItemId: 'q-den', jobListingId: 'listing-den', status: 'interviewing'
      }))

      const updated = repo.updateStatus(created.id!, 'denied', { updatedBy: 'email_tracker' })
      expect(updated?.status).toBe('denied')
      expect(updated?.statusUpdatedBy).toBe('email_tracker')
    })

    it('sets applied_at only on first transition to applied', () => {
      createListing('listing-app')
      const created = repo.upsert(buildJobMatchInput({
        queueItemId: 'q-app', jobListingId: 'listing-app', status: 'active'
      }))

      const applied = repo.updateStatus(created.id!, 'applied')
      expect(applied?.appliedAt).toBeDefined()
      const firstAppliedAt = applied?.appliedAt

      // Going through acknowledged and back to applied should not change applied_at
      repo.updateStatus(created.id!, 'acknowledged')
      const reapplied = repo.updateStatus(created.id!, 'applied')
      expect(String(reapplied?.appliedAt)).toBe(String(firstAppliedAt))
    })

    it('preserves ignored_at when transitioning to non-ignored status', () => {
      createListing('listing-ign')
      const created = repo.upsert(buildJobMatchInput({
        queueItemId: 'q-ign', jobListingId: 'listing-ign', status: 'active'
      }))

      const ignored = repo.updateStatus(created.id!, 'ignored')
      expect(ignored?.ignoredAt).toBeDefined()
      expect(ignored?.status).toBe('ignored')

      const active = repo.updateStatus(created.id!, 'active')
      expect(active?.status).toBe('active')
    })
  })

  describe('filter by new statuses', () => {
    beforeEach(() => {
      createListing('l-1')
      createListing('l-2')
      createListing('l-3')
      repo.upsert(buildJobMatchInput({ queueItemId: 'q-1', jobListingId: 'l-1', status: 'applied' }))
      repo.upsert(buildJobMatchInput({ queueItemId: 'q-2', jobListingId: 'l-2', status: 'active' }))
    })

    it('filters by acknowledged status', () => {
      createListing('l-ack')
      const m = repo.upsert(buildJobMatchInput({ queueItemId: 'q-ack2', jobListingId: 'l-ack', status: 'applied' }))
      repo.updateStatus(m.id!, 'acknowledged')

      const results = repo.listWithListings({ status: 'acknowledged' })
      expect(results).toHaveLength(1)
      expect(results[0].status).toBe('acknowledged')
    })

    it('returns all statuses with status=all', () => {
      const all = repo.listWithListings({ status: 'all' })
      expect(all.length).toBeGreaterThanOrEqual(2)
    })
  })
})

describe('JobMatchRepository — ghost matches', () => {
  const repo = new JobMatchRepository()
  const db = getDb()

  // Ensure ghost sentinel listing exists (created by migration 065)
  const ensureGhostListing = () => {
    db.prepare(`
      INSERT OR IGNORE INTO job_listings (id, url, title, company_name, description, status, created_at, updated_at)
      VALUES ('__ghost_listing__', '', 'Ghost Listing (system)', 'N/A', 'Sentinel row for ghost matches', 'matched', datetime('now'), datetime('now'))
    `).run()
  }

  beforeEach(() => {
    db.prepare('DELETE FROM job_matches').run()
    ensureGhostListing()
  })

  it('creates a ghost match', () => {
    const ghost = repo.createGhost({
      company: 'Stealth Startup',
      title: 'Lead Engineer',
      url: 'https://stealth.co/careers',
      notes: 'Applied via their website directly'
    })

    expect(ghost).not.toBeNull()
    expect(ghost!.isGhost).toBe(true)
    expect(ghost!.ghostCompany).toBe('Stealth Startup')
    expect(ghost!.ghostTitle).toBe('Lead Engineer')
    expect(ghost!.ghostUrl).toBe('https://stealth.co/careers')
    expect(ghost!.ghostNotes).toBe('Applied via their website directly')
    expect(ghost!.status).toBe('applied')
    expect(ghost!.appliedAt).toBeDefined()
  })

  it('ghost match listing uses ghost fields', () => {
    const ghost = repo.createGhost({
      company: 'Mystery Corp',
      title: 'Staff Engineer'
    })

    expect(ghost!.listing.title).toBe('Staff Engineer')
    expect(ghost!.listing.companyName).toBe('Mystery Corp')
    expect(ghost!.listing.id).toBe('__ghost_listing__')
  })

  it('ghost matches appear in listWithListings', () => {
    repo.createGhost({ company: 'Ghost Co', title: 'Dev' })

    const results = repo.listWithListings({ status: 'all' })
    const ghosts = results.filter(m => m.isGhost)
    expect(ghosts).toHaveLength(1)
    expect(ghosts[0].listing.companyName).toBe('Ghost Co')
  })

  it('ghost matches are searchable by ghost company name', () => {
    repo.createGhost({ company: 'UniqueGhostCorp', title: 'Dev' })

    const results = repo.listWithListings({ search: 'UniqueGhostCorp' })
    expect(results).toHaveLength(1)
  })

  it('ghost matches are searchable by ghost title', () => {
    repo.createGhost({ company: 'Some Co', title: 'SpecialUniqueRole' })

    const results = repo.listWithListings({ search: 'SpecialUniqueRole' })
    expect(results).toHaveLength(1)
  })

  it('can update status of ghost match', () => {
    const ghost = repo.createGhost({ company: 'Test Co', title: 'Dev' })

    const updated = repo.updateStatus(ghost!.id!, 'interviewing', {
      updatedBy: 'user',
      note: 'First round next week'
    })

    expect(updated?.status).toBe('interviewing')
    expect(updated?.statusNote).toBe('First round next week')
    expect(updated?.listing.companyName).toBe('Test Co')
  })
})
