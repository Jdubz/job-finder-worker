import { describe, beforeEach, it, expect } from 'vitest'
import { ContentItemRepository, ContentItemNotFoundError } from '../content-item.repository'
import { getDb } from '../../../db/sqlite'

const repo = new ContentItemRepository()
const TEST_USER = 'test-user'
const baseUser = { email: 'owner@example.com' }

beforeEach(() => {
  const db = getDb()
  db.prepare('DELETE FROM content_items').run()
})

describe('ContentItemRepository', () => {
  it('creates items and lists them', () => {
    const parent = repo.create(TEST_USER, { userEmail: baseUser.email, title: 'Parent' })
    repo.create(TEST_USER, { userEmail: baseUser.email, title: 'Child', parentId: parent.id })

    const items = repo.list(TEST_USER, {})
    expect(items).toHaveLength(2)
    const child = items.find((item) => item.parentId === parent.id)
    expect(child?.title).toBe('Child')
  })

  it('reorders siblings and moves items between parents', () => {
    const rootA = repo.create(TEST_USER, { userEmail: baseUser.email, title: 'A' })
    const rootB = repo.create(TEST_USER, { userEmail: baseUser.email, title: 'B' })
    const child = repo.create(TEST_USER, { userEmail: baseUser.email, title: 'Child' })

    repo.reorder(TEST_USER, rootB.id, null, 0, baseUser.email)
    const orderedRoots = repo.list(TEST_USER, {}).filter((item) => item.parentId === null)
    expect(orderedRoots.slice(0, 2).map((item) => item.title)).toEqual(['B', 'A'])

    repo.reorder(TEST_USER, child.id, rootA.id, 0, baseUser.email)
    const updatedChild = repo.getById(TEST_USER, child.id)
    expect(updatedChild?.parentId).toBe(rootA.id)
  })

  it('throws on deleting non-existent items', () => {
    expect(() => repo.delete(TEST_USER, 'missing-item')).toThrow(ContentItemNotFoundError)
  })
})
