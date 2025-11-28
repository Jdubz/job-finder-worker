import { beforeEach, describe, expect, it } from 'vitest'
import { JobMatchRepository } from '../job-match.repository'
import { JobListingRepository } from '../../job-listings/job-listing.repository'
import { getDb } from '../../../db/sqlite'
import { buildJobMatchInput, buildJobListingRecord } from './fixtures'

describe('JobMatchRepository', () => {
  const repo = new JobMatchRepository()
  const listingRepo = new JobListingRepository()
  const db = getDb()

  // Helper to create a job listing first (required for FK constraint)
  const createListing = (id: string) => {
    listingRepo.create(buildJobListingRecord({ id }))
  }

  beforeEach(() => {
    // Delete in correct order for FK constraints
    db.prepare('DELETE FROM job_matches').run()
    db.prepare('DELETE FROM job_listings').run()
  })

  it('upserts a job match and retrieves normalized data', () => {
    createListing('listing-1')
    const created = repo.upsert(buildJobMatchInput({ queueItemId: 'queue-1', jobListingId: 'listing-1' }))

    expect(created.id).toBeDefined()
    expect(created.matchedSkills).toEqual(['TypeScript', 'React'])
    expect(created.keyStrengths).toContain('Mentors teammates')

    const fetched = repo.getById(created.id!)
    expect(fetched?.jobListingId).toBe(created.jobListingId)
    expect(fetched?.matchScore).toBe(90)
  })

  it('filters and sorts listings when listing matches', () => {
    createListing('listing-2')
    createListing('listing-3')
    createListing('listing-4')

    repo.upsert(buildJobMatchInput({ queueItemId: 'queue-2', jobListingId: 'listing-2', matchScore: 95 }))
    repo.upsert(
      buildJobMatchInput({
        queueItemId: 'queue-3',
        jobListingId: 'listing-3',
        matchScore: 70,
        applicationPriority: 'Low'
      })
    )
    repo.upsert(buildJobMatchInput({ queueItemId: 'queue-4', jobListingId: 'listing-4', matchScore: 82 }))

    const results = repo.list({
      minScore: 80,
      priority: 'High',
      sortBy: 'score',
      sortOrder: 'asc'
    })

    expect(results).toHaveLength(2)
    expect(results[0].matchScore).toBe(82)
    expect(results[1].matchScore).toBe(95)
  })

  it('updates an existing match when the same id is provided', () => {
    createListing('listing-5')
    const initial = repo.upsert(buildJobMatchInput({ queueItemId: 'queue-5', jobListingId: 'listing-5' }))
    const updated = repo.upsert({
      ...initial,
      matchScore: 65,
      keyStrengths: ['Drives roadmap'],
      id: initial.id
    })

    expect(updated.matchScore).toBe(65)
    expect(updated.keyStrengths).toContain('Drives roadmap')

    const fetched = repo.getById(initial.id!)
    expect(fetched?.matchScore).toBe(65)
  })

  it('deletes matches by id', () => {
    createListing('listing-6')
    const created = repo.upsert(buildJobMatchInput({ queueItemId: 'queue-6', jobListingId: 'listing-6' }))
    repo.delete(created.id!)

    expect(repo.getById(created.id!)).toBeNull()
  })

  it('filters by jobListingId', () => {
    createListing('target-listing')
    createListing('other-listing')

    repo.upsert(buildJobMatchInput({ queueItemId: 'queue-7', jobListingId: 'target-listing' }))
    repo.upsert(buildJobMatchInput({ queueItemId: 'queue-8', jobListingId: 'other-listing' }))

    const results = repo.list({ jobListingId: 'target-listing' })

    expect(results).toHaveLength(1)
    expect(results[0].jobListingId).toBe('target-listing')
  })

  it('returns match by jobListingId', () => {
    createListing('test-listing')
    const created = repo.upsert(buildJobMatchInput({ queueItemId: 'queue-9', jobListingId: 'test-listing' }))

    const fetched = repo.getByJobListingId('test-listing')
    expect(fetched?.id).toBe(created.id)
    expect(fetched?.jobListingId).toBe('test-listing')
  })
})
