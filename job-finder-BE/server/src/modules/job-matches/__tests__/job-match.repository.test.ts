import { beforeEach, describe, expect, it } from 'vitest'
import { JobMatchRepository } from '../job-match.repository'
import { getDb } from '../../../db/sqlite'
import { buildJobMatchInput } from './fixtures'

describe('JobMatchRepository', () => {
  const repo = new JobMatchRepository()
  const db = getDb()

  beforeEach(() => {
    db.prepare('DELETE FROM job_matches').run()
  })

  it('upserts a job match and retrieves normalized data', () => {
    const created = repo.upsert(buildJobMatchInput({ queueItemId: 'queue-1' }))

    expect(created.id).toBeDefined()
    expect(created.matchedSkills).toEqual(['TypeScript', 'React'])
    expect(created.keyStrengths).toContain('Mentors teammates')

    const fetched = repo.getById(created.id!)
    expect(fetched?.url).toBe(created.url)
    expect(fetched?.matchScore).toBe(90)
  })

  it('filters and sorts listings when listing matches', () => {
    repo.upsert(buildJobMatchInput({ queueItemId: 'queue-2', companyName: 'Acme Robotics', matchScore: 95 }))
    repo.upsert(
      buildJobMatchInput({
        queueItemId: 'queue-3',
        companyName: 'Beta Analytics',
        matchScore: 70,
        applicationPriority: 'Low',
      }),
    )
    repo.upsert(buildJobMatchInput({ queueItemId: 'queue-4', companyName: 'Acme Labs', matchScore: 82 }))

    const results = repo.list({
      minScore: 80,
      companyName: 'acme',
      priority: 'High',
      sortBy: 'score',
      sortOrder: 'asc',
    })

    expect(results).toHaveLength(2)
    expect(results[0].matchScore).toBe(82)
    expect(results[1].matchScore).toBe(95)
  })

  it('updates an existing match when the same id is provided', () => {
    const initial = repo.upsert(buildJobMatchInput({ queueItemId: 'queue-5' }))
    const updated = repo.upsert({
      ...initial,
      matchScore: 65,
      keyStrengths: ['Drives roadmap'],
      id: initial.id,
    })

    expect(updated.matchScore).toBe(65)
    expect(updated.keyStrengths).toContain('Drives roadmap')

    const fetched = repo.getById(initial.id!)
    expect(fetched?.matchScore).toBe(65)
  })

  it('deletes matches by id', () => {
    const created = repo.upsert(buildJobMatchInput({ queueItemId: 'queue-6' }))
    repo.delete(created.id!)

    expect(repo.getById(created.id!)).toBeNull()
  })
})
