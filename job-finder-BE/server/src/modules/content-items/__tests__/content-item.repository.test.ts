import { describe, beforeEach, it, expect } from 'vitest'
import { ContentItemRepository, ContentItemInvalidParentError, ContentItemNotFoundError } from '../content-item.repository'
import { getDb } from '../../../db/sqlite'

const repo = new ContentItemRepository()
const baseUser = { id: 'user-1', email: 'owner@example.com' }

beforeEach(() => {
  const db = getDb()
  db.prepare('DELETE FROM content_items').run()
})

describe('ContentItemRepository', () => {
  it('creates items and lists them for the given user', () => {
    const parent = repo.create({ userId: baseUser.id, userEmail: baseUser.email, title: 'Parent', visibility: 'published' })
    repo.create({ userId: baseUser.id, userEmail: baseUser.email, title: 'Child', parentId: parent.id, visibility: 'published' })

    const items = repo.list({ userId: baseUser.id, includeDrafts: true })
    expect(items).toHaveLength(2)
    const child = items.find((item) => item.parentId === parent.id)
    expect(child?.title).toBe('Child')
  })

  it('excludes drafts by default but includes them when requested', () => {
    repo.create({ userId: baseUser.id, userEmail: baseUser.email, title: 'Published', visibility: 'published' })
    repo.create({ userId: baseUser.id, userEmail: baseUser.email, title: 'Draft', visibility: 'draft' })

    expect(repo.list({ userId: baseUser.id })).toHaveLength(1)
    expect(repo.list({ userId: baseUser.id, includeDrafts: true })).toHaveLength(2)
  })

  it('reorders siblings and moves items between parents', () => {
    const rootA = repo.create({ userId: baseUser.id, userEmail: baseUser.email, title: 'A', visibility: 'published' })
    const rootB = repo.create({ userId: baseUser.id, userEmail: baseUser.email, title: 'B', visibility: 'published' })
    const child = repo.create({ userId: baseUser.id, userEmail: baseUser.email, title: 'Child', visibility: 'published' })

    repo.reorder(rootB.id, null, 0, baseUser.email)
    const orderedRoots = repo
      .list({ userId: baseUser.id, includeDrafts: true })
      .filter((item) => item.parentId === null)
    expect(orderedRoots.slice(0, 2).map((item) => item.title)).toEqual(['B', 'A'])

    repo.reorder(child.id, rootA.id, 0, baseUser.email)
    const updatedChild = repo.getById(child.id)
    expect(updatedChild?.parentId).toBe(rootA.id)
  })

  it('prevents assigning a parent owned by another user', () => {
    const userChild = repo.create({ userId: 'user-a', userEmail: baseUser.email, title: 'child', visibility: 'published' })
    const otherParent = repo.create({ userId: 'user-b', userEmail: baseUser.email, title: 'other-parent', visibility: 'published' })

    expect(() =>
      repo.reorder(userChild.id, otherParent.id, 0, baseUser.email)
    ).toThrow(ContentItemInvalidParentError)
  })

  it('throws on deleting non-existent items', () => {
    expect(() => repo.delete('missing-item')).toThrow(ContentItemNotFoundError)
  })
})
