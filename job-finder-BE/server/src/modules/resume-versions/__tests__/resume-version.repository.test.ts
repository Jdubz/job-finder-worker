import { describe, beforeEach, it, expect } from 'vitest'
import {
  ResumeVersionRepository,
  ResumeVersionNotFoundError,
  ResumeItemNotFoundError,
  ResumeItemInvalidParentError
} from '../resume-version.repository'
import { getDb } from '../../../db/sqlite'

const repo = new ResumeVersionRepository()
const baseUser = 'test@example.com'

beforeEach(() => {
  const db = getDb()
  db.prepare('DELETE FROM resume_items').run()
  // Don't delete resume_versions — seeded by migration
})

describe('ResumeVersionRepository', () => {
  // ── Version queries ────────────────────────────────────────────

  describe('versions', () => {
    it('lists all seeded versions', () => {
      const versions = repo.listVersions()
      expect(versions).toHaveLength(5)
      const slugs = versions.map((v) => v.slug).sort()
      expect(slugs).toEqual(['ai', 'backend', 'frontend', 'fullstack', 'solution-engineer'])
    })

    it('gets version by slug', () => {
      const version = repo.getVersionBySlug('frontend')
      expect(version).not.toBeNull()
      expect(version!.name).toBe('Frontend Engineer')
      expect(version!.pdfPath).toBeNull()
      expect(version!.publishedAt).toBeNull()
    })

    it('returns null for unknown slug', () => {
      expect(repo.getVersionBySlug('nonexistent')).toBeNull()
    })

    it('updates publish state', () => {
      const updated = repo.updateVersionPublish('backend', 'resumes/backend.pdf', 12345, 'admin@test.com')
      expect(updated.pdfPath).toBe('resumes/backend.pdf')
      expect(updated.pdfSizeBytes).toBe(12345)
      expect(updated.publishedBy).toBe('admin@test.com')
      expect(updated.publishedAt).not.toBeNull()
    })

    it('throws when updating publish for unknown slug', () => {
      expect(() => repo.updateVersionPublish('missing', 'x.pdf', 1, 'admin@test.com'))
        .toThrow(ResumeVersionNotFoundError)
    })
  })

  // ── Item CRUD ──────────────────────────────────────────────────

  describe('items', () => {
    it('creates an item and retrieves it', () => {
      const version = repo.getVersionBySlug('frontend')!
      const item = repo.createItem(version.id, {
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
      const version = repo.getVersionBySlug('frontend')!
      const a = repo.createItem(version.id, { title: 'A', userEmail: baseUser })
      const b = repo.createItem(version.id, { title: 'B', userEmail: baseUser })
      const c = repo.createItem(version.id, { title: 'C', userEmail: baseUser })

      expect(a.orderIndex).toBe(0)
      expect(b.orderIndex).toBe(1)
      expect(c.orderIndex).toBe(2)
    })

    it('creates nested items (parent-child)', () => {
      const version = repo.getVersionBySlug('frontend')!
      const parent = repo.createItem(version.id, {
        title: 'AWS',
        aiContext: 'work',
        role: 'Solutions Architect',
        userEmail: baseUser
      })
      const child = repo.createItem(version.id, {
        parentId: parent.id,
        aiContext: 'highlight',
        description: 'Led migration of 50 services',
        userEmail: baseUser
      })

      expect(child.parentId).toBe(parent.id)
      expect(child.orderIndex).toBe(0)
    })

    it('lists items for a version', () => {
      const frontend = repo.getVersionBySlug('frontend')!
      const backend = repo.getVersionBySlug('backend')!

      repo.createItem(frontend.id, { title: 'FE Item', userEmail: baseUser })
      repo.createItem(backend.id, { title: 'BE Item', userEmail: baseUser })

      const feItems = repo.listItems(frontend.id)
      expect(feItems).toHaveLength(1)
      expect(feItems[0].title).toBe('FE Item')

      const beItems = repo.listItems(backend.id)
      expect(beItems).toHaveLength(1)
      expect(beItems[0].title).toBe('BE Item')
    })

    it('counts items for a version', () => {
      const version = repo.getVersionBySlug('ai')!
      expect(repo.countItems(version.id)).toBe(0)

      repo.createItem(version.id, { title: 'Item 1', userEmail: baseUser })
      repo.createItem(version.id, { title: 'Item 2', userEmail: baseUser })
      expect(repo.countItems(version.id)).toBe(2)
    })

    it('updates an item', () => {
      const version = repo.getVersionBySlug('frontend')!
      const item = repo.createItem(version.id, {
        title: 'Original',
        aiContext: 'work',
        userEmail: baseUser
      })

      const updated = repo.updateItem(item.id, {
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
      expect(() => repo.updateItem('missing', { title: 'X', userEmail: baseUser }))
        .toThrow(ResumeItemNotFoundError)
    })

    it('deletes an item', () => {
      const version = repo.getVersionBySlug('frontend')!
      const item = repo.createItem(version.id, { title: 'To Delete', userEmail: baseUser })
      repo.deleteItem(item.id)
      expect(repo.getItemById(item.id)).toBeNull()
    })

    it('throws when deleting non-existent item', () => {
      expect(() => repo.deleteItem('missing')).toThrow(ResumeItemNotFoundError)
    })
  })

  // ── Reorder ────────────────────────────────────────────────────

  describe('reorder', () => {
    it('reorders siblings', () => {
      const version = repo.getVersionBySlug('frontend')!
      repo.createItem(version.id, { title: 'A', userEmail: baseUser })
      repo.createItem(version.id, { title: 'B', userEmail: baseUser })
      const c = repo.createItem(version.id, { title: 'C', userEmail: baseUser })

      // Move C to position 0 (before A)
      repo.reorderItem(c.id, null, 0, baseUser)

      const items = repo.listItems(version.id).filter((i) => i.parentId === null)
      expect(items.map((i) => i.title)).toEqual(['C', 'A', 'B'])
    })

    it('moves item to a new parent', () => {
      const version = repo.getVersionBySlug('frontend')!
      const parent = repo.createItem(version.id, { title: 'Parent', aiContext: 'section', userEmail: baseUser })
      const orphan = repo.createItem(version.id, { title: 'Orphan', userEmail: baseUser })

      repo.reorderItem(orphan.id, parent.id, 0, baseUser)

      const updated = repo.getItemById(orphan.id)
      expect(updated!.parentId).toBe(parent.id)
    })

    it('throws when reparenting to non-existent parent', () => {
      const version = repo.getVersionBySlug('frontend')!
      const item = repo.createItem(version.id, { title: 'Item', userEmail: baseUser })

      expect(() => repo.reorderItem(item.id, 'missing-parent', 0, baseUser))
        .toThrow(ResumeItemInvalidParentError)
    })

    it('throws when reparenting across versions', () => {
      const frontend = repo.getVersionBySlug('frontend')!
      const backend = repo.getVersionBySlug('backend')!
      const feItem = repo.createItem(frontend.id, { title: 'FE Item', userEmail: baseUser })
      const beParent = repo.createItem(backend.id, { title: 'BE Parent', userEmail: baseUser })

      expect(() => repo.reorderItem(feItem.id, beParent.id, 0, baseUser))
        .toThrow(ResumeItemInvalidParentError)
    })

    it('throws when reordering non-existent item', () => {
      expect(() => repo.reorderItem('missing', null, 0, baseUser))
        .toThrow(ResumeItemNotFoundError)
    })
  })
})
