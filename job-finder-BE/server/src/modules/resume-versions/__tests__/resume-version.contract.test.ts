import express from 'express'
import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildResumeVersionRouter } from '../resume-version.routes'
import { ResumeVersionRepository } from '../resume-version.repository'
import type { AuthenticatedRequest } from '../../../middleware/firebase-auth'
import { getDb } from '../../../db/sqlite'

const createApp = () => {
  const app = express()
  app.use(express.json())
  // Simulate authenticated admin user for mutation routes
  app.use((req, _res, next) => {
    ;(req as AuthenticatedRequest).user = {
      uid: 'test-user',
      email: 'admin@test.dev',
      name: 'Test Admin',
      roles: ['admin', 'viewer']
    }
    next()
  })
  app.use('/resume-versions', buildResumeVersionRouter({ mutationsMiddleware: [] }))
  return app
}

describe('resume-version routes contract', () => {
  const db = getDb()
  const repo = new ResumeVersionRepository()
  const app = createApp()
  const userEmail = 'admin@test.dev'

  beforeEach(() => {
    db.prepare('DELETE FROM resume_items').run()
  })

  // ── Version endpoints ──────────────────────────────────────────

  describe('GET /resume-versions', () => {
    it('returns the pool version (seeded by migration 063)', async () => {
      const res = await request(app).get('/resume-versions')
      expect(res.status).toBe(200)
      expect(res.body.data.versions.length).toBeGreaterThanOrEqual(1)

      const slugs = res.body.data.versions.map((v: any) => v.slug)
      expect(slugs).toContain('pool')
    })
  })

  describe('GET /resume-versions/:slug', () => {
    it('returns version detail with items tree', async () => {
      const res = await request(app).get('/resume-versions/pool')
      expect(res.status).toBe(200)
      expect(res.body.data.version.slug).toBe('pool')
      expect(res.body.data.version.name).toBe('Resume Pool')
      expect(res.body.data.items).toEqual([])
    })

    it('returns version with nested items tree', async () => {
      const version = repo.getVersionBySlug('pool')!
      const section = repo.createItem(version.id, {
        title: 'Experience',
        aiContext: 'section',
        userEmail
      })
      repo.createItem(version.id, {
        parentId: section.id,
        title: 'AWS',
        aiContext: 'work',
        role: 'Solutions Architect',
        userEmail
      })

      const res = await request(app).get('/resume-versions/pool')
      expect(res.status).toBe(200)
      expect(res.body.data.items).toHaveLength(1) // 1 root
      expect(res.body.data.items[0].title).toBe('Experience')
      expect(res.body.data.items[0].children).toHaveLength(1)
      expect(res.body.data.items[0].children[0].title).toBe('AWS')
    })

    it('returns 404 for unknown slug', async () => {
      const res = await request(app).get('/resume-versions/nonexistent')
      expect(res.status).toBe(404)
    })
  })

  describe('GET /resume-versions/:slug/items', () => {
    it('returns items tree with total count', async () => {
      const version = repo.getVersionBySlug('pool')!
      repo.createItem(version.id, { title: 'Item A', userEmail })
      repo.createItem(version.id, { title: 'Item B', userEmail })

      const res = await request(app).get('/resume-versions/pool/items')
      expect(res.status).toBe(200)
      expect(res.body.data.items).toHaveLength(2)
      expect(res.body.data.total).toBe(2)
    })
  })

  // ── Version mutation endpoints ─────────────────────────────────

  describe('POST /resume-versions', () => {
    const cleanupSlugs: string[] = []

    afterEach(() => {
      for (const slug of cleanupSlugs) {
        try { repo.deleteVersion(slug) } catch { /* already deleted */ }
      }
      cleanupSlugs.length = 0
    })

    it('creates a new version', async () => {
      cleanupSlugs.push('test-new')
      const res = await request(app)
        .post('/resume-versions')
        .send({ name: 'Test New', slug: 'test-new', description: 'A test version' })

      expect(res.status).toBe(201)
      expect(res.body.data.version.name).toBe('Test New')
      expect(res.body.data.version.slug).toBe('test-new')
      expect(res.body.data.version.description).toBe('A test version')
      expect(res.body.data.message).toContain('created')
    })

    it('returns 409 for duplicate slug', async () => {
      const res = await request(app)
        .post('/resume-versions')
        .send({ name: 'Dupe', slug: 'pool' })

      expect(res.status).toBe(409)
      expect(res.body.error.code).toBe('ALREADY_EXISTS')
    })

    it('returns 400 for invalid slug format', async () => {
      const res = await request(app)
        .post('/resume-versions')
        .send({ name: 'Bad Slug', slug: 'Has Spaces' })

      expect(res.status).toBe(400)
    })

    it('returns 400 for missing name', async () => {
      const res = await request(app)
        .post('/resume-versions')
        .send({ slug: 'no-name' })

      expect(res.status).toBe(400)
    })
  })

  describe('DELETE /resume-versions/:slug', () => {
    it('deletes a version and its items', async () => {
      // Create a version to delete
      repo.createVersion({ name: 'To Delete', slug: 'to-delete' })
      const version = repo.getVersionBySlug('to-delete')!
      repo.createItem(version.id, { title: 'Item', userEmail })

      const res = await request(app).delete('/resume-versions/to-delete')
      expect(res.status).toBe(200)
      expect(res.body.data.deleted).toBe(true)
      expect(res.body.data.slug).toBe('to-delete')

      // Verify version is gone
      expect(repo.getVersionBySlug('to-delete')).toBeNull()
    })

    it('returns 404 for unknown slug', async () => {
      const res = await request(app).delete('/resume-versions/nonexistent')
      expect(res.status).toBe(404)
    })
  })

  // ── Item CRUD endpoints ────────────────────────────────────────

  describe('POST /resume-versions/:slug/items', () => {
    it('creates a root item', async () => {
      const res = await request(app)
        .post('/resume-versions/pool/items')
        .send({ itemData: { title: 'Skills', aiContext: 'section' } })

      expect(res.status).toBe(201)
      expect(res.body.data.item.title).toBe('Skills')
      expect(res.body.data.item.aiContext).toBe('section')
      expect(res.body.data.item.parentId).toBeNull()
    })

    it('creates a child item', async () => {
      const version = repo.getVersionBySlug('pool')!
      const parent = repo.createItem(version.id, { title: 'Exp', aiContext: 'section', userEmail })

      const res = await request(app)
        .post('/resume-versions/pool/items')
        .send({
          itemData: {
            parentId: parent.id,
            title: 'Company',
            aiContext: 'work',
            role: 'Engineer',
            startDate: '2023-01',
            endDate: '2025-06',
            skills: ['TypeScript', 'React']
          }
        })

      expect(res.status).toBe(201)
      expect(res.body.data.item.parentId).toBe(parent.id)
      expect(res.body.data.item.skills).toEqual(['TypeScript', 'React'])
    })

    it('returns 404 for unknown version slug', async () => {
      const res = await request(app)
        .post('/resume-versions/nonexistent/items')
        .send({ itemData: { title: 'X' } })

      expect(res.status).toBe(404)
    })

    it('returns 400 for invalid date format', async () => {
      const res = await request(app)
        .post('/resume-versions/pool/items')
        .send({
          itemData: { title: 'Bad Date', startDate: '2023-13-01' }
        })

      expect(res.status).toBe(400)
    })
  })

  describe('PATCH /resume-versions/:slug/items/:id', () => {
    it('updates an item', async () => {
      const version = repo.getVersionBySlug('pool')!
      const item = repo.createItem(version.id, { title: 'Original', userEmail })

      const res = await request(app)
        .patch(`/resume-versions/pool/items/${item.id}`)
        .send({ itemData: { title: 'Updated', description: 'New desc' } })

      expect(res.status).toBe(200)
      expect(res.body.data.item.title).toBe('Updated')
      expect(res.body.data.item.description).toBe('New desc')
    })

    it('returns 404 for unknown item', async () => {
      const res = await request(app)
        .patch('/resume-versions/pool/items/missing-id')
        .send({ itemData: { title: 'X' } })

      expect(res.status).toBe(404)
    })
  })

  describe('DELETE /resume-versions/:slug/items/:id', () => {
    it('deletes an item', async () => {
      const version = repo.getVersionBySlug('pool')!
      const item = repo.createItem(version.id, { title: 'To Delete', userEmail })

      const res = await request(app)
        .delete(`/resume-versions/pool/items/${item.id}`)

      expect(res.status).toBe(200)
      expect(res.body.data.deleted).toBe(true)

      // Verify deleted
      const get = await request(app).get('/resume-versions/pool/items')
      expect(get.body.data.items).toHaveLength(0)
    })

    it('returns 404 for unknown item', async () => {
      const res = await request(app)
        .delete('/resume-versions/pool/items/missing')
      expect(res.status).toBe(404)
    })
  })

  describe('POST /resume-versions/:slug/items/:id/reorder', () => {
    it('reorders items', async () => {
      const version = repo.getVersionBySlug('pool')!
      repo.createItem(version.id, { title: 'A', userEmail })
      repo.createItem(version.id, { title: 'B', userEmail })
      const c = repo.createItem(version.id, { title: 'C', userEmail })

      // Move C to position 0
      const res = await request(app)
        .post(`/resume-versions/pool/items/${c.id}/reorder`)
        .send({ orderIndex: 0 })

      expect(res.status).toBe(200)

      // Verify new order
      const list = await request(app).get('/resume-versions/pool/items')
      const titles = list.body.data.items.map((i: any) => i.title)
      expect(titles).toEqual(['C', 'A', 'B'])
    })

    it('moves item to a parent', async () => {
      const version = repo.getVersionBySlug('pool')!
      const parent = repo.createItem(version.id, { title: 'Parent', aiContext: 'section', userEmail })
      const child = repo.createItem(version.id, { title: 'Orphan', userEmail })

      const res = await request(app)
        .post(`/resume-versions/pool/items/${child.id}/reorder`)
        .send({ parentId: parent.id, orderIndex: 0 })

      expect(res.status).toBe(200)
      expect(res.body.data.item.parentId).toBe(parent.id)
    })
  })

  // ── PDF endpoint ───────────────────────────────────────────────

  describe('GET /resume-versions/:slug/pdf', () => {
    it('returns 404 when not published', async () => {
      const res = await request(app).get('/resume-versions/pool/pdf')
      expect(res.status).toBe(404)
      expect(res.body.error.message).toContain('not been published')
    })

    it('returns 404 for unknown slug', async () => {
      const res = await request(app).get('/resume-versions/nonexistent/pdf')
      expect(res.status).toBe(404)
    })
  })
})
