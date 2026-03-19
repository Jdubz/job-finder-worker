import { describe, beforeEach, it, expect } from 'vitest'
import {
  ResumeVersionRepository,
  ResumeVersionNotFoundError,
  ResumeItemNotFoundError,
  ResumeItemInvalidParentError
} from '../resume-version.repository'
import { getDb } from '../../../db/sqlite'

const repo = new ResumeVersionRepository()
const TEST_USER = 'test-user'
const baseUser = 'test@example.com'

beforeEach(() => {
  const db = getDb()
  db.prepare('DELETE FROM resume_items').run()
  // Don't delete resume_versions — seeded by migration
  // Ensure the pool version is owned by the test user
  db.prepare('UPDATE resume_versions SET user_id = ? WHERE slug = ?').run(TEST_USER, 'pool')
})

describe('ResumeVersionRepository', () => {
  // ── Version queries ────────────────────────────────────────────

  describe('versions', () => {
    it('lists the pool version (created by migration 063)', () => {
      const versions = repo.listVersions(TEST_USER)
      expect(versions.length).toBeGreaterThanOrEqual(1)
      const slugs = versions.map((v) => v.slug)
      expect(slugs).toContain('pool')
    })

    it('gets version by slug', () => {
      const version = repo.getVersionBySlug(TEST_USER, 'pool')
      expect(version).not.toBeNull()
      expect(version!.name).toBe('Resume Pool')
    })

    it('returns null for unknown slug', () => {
      expect(repo.getVersionBySlug(TEST_USER, 'nonexistent')).toBeNull()
    })

    it('updates publish state', () => {
      const updated = repo.updateVersionPublish(TEST_USER, 'pool', 'resumes/pool.pdf', 12345, 'admin@test.com')
      expect(updated.pdfPath).toBe('resumes/pool.pdf')
      expect(updated.pdfSizeBytes).toBe(12345)
      expect(updated.publishedBy).toBe('admin@test.com')
      expect(updated.publishedAt).not.toBeNull()
    })

    it('throws when updating publish for unknown slug', () => {
      expect(() => repo.updateVersionPublish(TEST_USER, 'missing', 'x.pdf', 1, 'admin@test.com'))
        .toThrow(ResumeVersionNotFoundError)
    })
  })

  // ── Item CRUD ──────────────────────────────────────────────────

  describe('items', () => {
    it('creates an item and retrieves it', () => {
      const version = repo.getVersionBySlug(TEST_USER, 'pool')!
      const item = repo.createItem(TEST_USER, version.id, {
        title: 'Experience',
        aiContext: 'section',
        userEmail: baseUser
      })

      expect(item.id).toBeTruthy()
      expect(item.resumeVersionId).toBe(version.id)
      expect(item.title).toBe('Experience')
      expect(item.aiContext).toBe('section')
      expect(item.orderIndex).toBe(0)
    })

    it('auto-increments order for siblings', () => {
      const version = repo.getVersionBySlug(TEST_USER, 'pool')!
      const a = repo.createItem(TEST_USER, version.id, { title: 'A', userEmail: baseUser })
      const b = repo.createItem(TEST_USER, version.id, { title: 'B', userEmail: baseUser })
      const c = repo.createItem(TEST_USER, version.id, { title: 'C', userEmail: baseUser })

      expect(a.orderIndex).toBe(0)
      expect(b.orderIndex).toBe(1)
      expect(c.orderIndex).toBe(2)
    })

    it('creates nested items (parent-child)', () => {
      const version = repo.getVersionBySlug(TEST_USER, 'pool')!
      const parent = repo.createItem(TEST_USER, version.id, {
        title: 'AWS',
        aiContext: 'work',
        role: 'Solutions Architect',
        userEmail: baseUser
      })
      const child = repo.createItem(TEST_USER, version.id, {
        parentId: parent.id,
        aiContext: 'highlight',
        description: 'Led migration of 50 services',
        userEmail: baseUser
      })

      expect(child.parentId).toBe(parent.id)
      expect(child.orderIndex).toBe(0)
    })

    it('lists items for a version', () => {
      const pool = repo.getVersionBySlug(TEST_USER, 'pool')!

      // Create a temporary second version for isolation testing
      const testVersion = repo.createVersion(TEST_USER, { name: 'Test Version', slug: 'test-items' })

      repo.createItem(TEST_USER, pool.id, { title: 'Pool Item', userEmail: baseUser })
      repo.createItem(TEST_USER, testVersion.id, { title: 'Test Item', userEmail: baseUser })

      const poolItems = repo.listItems(TEST_USER, pool.id)
      expect(poolItems).toHaveLength(1)
      expect(poolItems[0].title).toBe('Pool Item')

      const testItems = repo.listItems(TEST_USER, testVersion.id)
      expect(testItems).toHaveLength(1)
      expect(testItems[0].title).toBe('Test Item')

      repo.deleteVersion(TEST_USER, 'test-items')
    })

    it('counts items for a version', () => {
      const version = repo.getVersionBySlug(TEST_USER, 'pool')!
      expect(repo.countItems(TEST_USER, version.id)).toBe(0)

      repo.createItem(TEST_USER, version.id, { title: 'Item 1', userEmail: baseUser })
      repo.createItem(TEST_USER, version.id, { title: 'Item 2', userEmail: baseUser })
      expect(repo.countItems(TEST_USER, version.id)).toBe(2)
    })

    it('updates an item', () => {
      const version = repo.getVersionBySlug(TEST_USER, 'pool')!
      const item = repo.createItem(TEST_USER, version.id, {
        title: 'Original',
        aiContext: 'work',
        userEmail: baseUser
      })

      const updated = repo.updateItem(TEST_USER, item.id, {
        title: 'Updated',
        role: 'Senior Engineer',
        skills: ['TypeScript', 'React'],
        userEmail: baseUser
      })

      expect(updated.title).toBe('Updated')
      expect(updated.role).toBe('Senior Engineer')
      expect(updated.skills).toEqual(['TypeScript', 'React'])
      expect(updated.aiContext).toBe('work') // unchanged
    })

    it('throws when updating non-existent item', () => {
      expect(() => repo.updateItem(TEST_USER, 'missing', { title: 'X', userEmail: baseUser }))
        .toThrow(ResumeItemNotFoundError)
    })

    it('deletes an item', () => {
      const version = repo.getVersionBySlug(TEST_USER, 'pool')!
      const item = repo.createItem(TEST_USER, version.id, { title: 'To Delete', userEmail: baseUser })
      repo.deleteItem(TEST_USER, item.id)
      expect(repo.getItemById(TEST_USER, item.id)).toBeNull()
    })

    it('throws when deleting non-existent item', () => {
      expect(() => repo.deleteItem(TEST_USER, 'missing')).toThrow(ResumeItemNotFoundError)
    })
  })

  // ── Reorder ────────────────────────────────────────────────────

  describe('reorder', () => {
    it('reorders siblings', () => {
      const version = repo.getVersionBySlug(TEST_USER, 'pool')!
      repo.createItem(TEST_USER, version.id, { title: 'A', userEmail: baseUser })
      repo.createItem(TEST_USER, version.id, { title: 'B', userEmail: baseUser })
      const c = repo.createItem(TEST_USER, version.id, { title: 'C', userEmail: baseUser })

      // Move C to position 0 (before A)
      repo.reorderItem(TEST_USER, c.id, null, 0, baseUser)

      const items = repo.listItems(TEST_USER, version.id).filter((i) => i.parentId === null)
      expect(items.map((i) => i.title)).toEqual(['C', 'A', 'B'])
    })

    it('moves item to a new parent', () => {
      const version = repo.getVersionBySlug(TEST_USER, 'pool')!
      const parent = repo.createItem(TEST_USER, version.id, { title: 'Parent', aiContext: 'section', userEmail: baseUser })
      const orphan = repo.createItem(TEST_USER, version.id, { title: 'Orphan', userEmail: baseUser })

      repo.reorderItem(TEST_USER, orphan.id, parent.id, 0, baseUser)

      const updated = repo.getItemById(TEST_USER, orphan.id)
      expect(updated!.parentId).toBe(parent.id)
    })

    it('throws when reparenting to non-existent parent', () => {
      const version = repo.getVersionBySlug(TEST_USER, 'pool')!
      const item = repo.createItem(TEST_USER, version.id, { title: 'Item', userEmail: baseUser })

      expect(() => repo.reorderItem(TEST_USER, item.id, 'missing-parent', 0, baseUser))
        .toThrow(ResumeItemInvalidParentError)
    })

    it('throws when reparenting across versions', () => {
      const pool = repo.getVersionBySlug(TEST_USER, 'pool')!
      const testVersion = repo.createVersion(TEST_USER, { name: 'Test Cross', slug: 'test-cross' })

      const poolItem = repo.createItem(TEST_USER, pool.id, { title: 'Pool Item', userEmail: baseUser })
      const testParent = repo.createItem(TEST_USER, testVersion.id, { title: 'Test Parent', userEmail: baseUser })

      expect(() => repo.reorderItem(TEST_USER, poolItem.id, testParent.id, 0, baseUser))
        .toThrow(ResumeItemInvalidParentError)

      repo.deleteVersion(TEST_USER, 'test-cross')
    })

    it('throws when reordering non-existent item', () => {
      expect(() => repo.reorderItem(TEST_USER, 'missing', null, 0, baseUser))
        .toThrow(ResumeItemNotFoundError)
    })
  })
})
