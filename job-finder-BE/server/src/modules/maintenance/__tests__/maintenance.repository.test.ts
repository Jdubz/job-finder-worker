import { beforeEach, describe, expect, it } from 'vitest'
import { MaintenanceRepository } from '../maintenance.repository'
import { JobMatchRepository } from '../../job-matches/job-match.repository'
import { JobListingRepository } from '../../job-listings/job-listing.repository'
import { getDb } from '../../../db/sqlite'
import { buildJobMatchInput, buildJobListingRecord } from '../../job-matches/__tests__/fixtures'

describe('MaintenanceRepository.archiveOldListings', () => {
  const repo = new MaintenanceRepository()
  const matchRepo = new JobMatchRepository()
  const listingRepo = new JobListingRepository()
  const db = getDb()

  beforeEach(() => {
    db.prepare('DELETE FROM job_matches').run()
    db.prepare('DELETE FROM job_listings').run()
    db.prepare('DELETE FROM job_listings_archive').run()
  })

  const ancient = new Date('2024-01-01T00:00:00Z')

  const createListing = (id: string, createdAt: Date) => {
    listingRepo.create(buildJobListingRecord({ id }))
    db.prepare('UPDATE job_listings SET created_at = ?, updated_at = ? WHERE id = ?').run(
      createdAt.toISOString(),
      createdAt.toISOString(),
      id
    )
  }

  it('archives listings whose only matches are active or ignored', () => {
    createListing('archivable-active', ancient)
    createListing('archivable-ignored', ancient)

    matchRepo.upsert(buildJobMatchInput({ jobListingId: 'archivable-active', status: 'active' }))
    matchRepo.upsert(buildJobMatchInput({ jobListingId: 'archivable-ignored', status: 'ignored' }))

    const archived = repo.archiveOldListings(14)

    expect(archived).toBe(2)
    const remaining = db.prepare('SELECT id FROM job_listings').all() as { id: string }[]
    expect(remaining).toEqual([])
  })

  it('protects listings with applied/interviewing/acknowledged/denied matches', () => {
    const protectedStatuses = ['applied', 'acknowledged', 'interviewing', 'denied'] as const

    for (const status of protectedStatuses) {
      const id = `keep-${status}`
      createListing(id, ancient)
      matchRepo.upsert(buildJobMatchInput({ jobListingId: id, status }))
    }

    const archived = repo.archiveOldListings(14)

    expect(archived).toBe(0)
    const remaining = db
      .prepare('SELECT id FROM job_listings ORDER BY id')
      .all() as { id: string }[]
    expect(remaining.map((row) => row.id)).toEqual([
      'keep-acknowledged',
      'keep-applied',
      'keep-denied',
      'keep-interviewing'
    ])
    const matches = db.prepare('SELECT COUNT(*) AS n FROM job_matches').get() as { n: number }
    expect(matches.n).toBe(4)
  })

  it('archives some and protects others in the same run', () => {
    createListing('drop-me', ancient)
    matchRepo.upsert(buildJobMatchInput({ jobListingId: 'drop-me', status: 'active' }))

    createListing('keep-me', ancient)
    matchRepo.upsert(buildJobMatchInput({ jobListingId: 'keep-me', status: 'applied' }))

    const archived = repo.archiveOldListings(14)

    expect(archived).toBe(1)
    const remaining = db.prepare('SELECT id FROM job_listings').all() as { id: string }[]
    expect(remaining.map((r) => r.id)).toEqual(['keep-me'])
  })

  it('leaves recent listings alone regardless of match status', () => {
    const recent = new Date()
    createListing('fresh', recent)
    matchRepo.upsert(buildJobMatchInput({ jobListingId: 'fresh', status: 'active' }))

    const archived = repo.archiveOldListings(14)
    expect(archived).toBe(0)
  })
})
