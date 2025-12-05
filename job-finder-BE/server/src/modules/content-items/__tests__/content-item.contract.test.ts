import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { contentItemSchema } from '@shared/types'
import { buildContentItemRouter } from '../content-item.routes'
import { ContentItemRepository } from '../content-item.repository'
import { getDb } from '../../../db/sqlite'

const createApp = () => {
  const app = express()
  app.use(express.json())
  app.use('/content-items', buildContentItemRouter({ mutationsMiddleware: [] }))
  return app
}

describe('content item contract', () => {
  const db = getDb()
  const repo = new ContentItemRepository()
  const app = createApp()

  beforeEach(() => {
    db.prepare('DELETE FROM content_items').run()
  })

  it('serializes list responses according to shared schema', async () => {
    repo.create({
      parentId: null,
      order: 0,
      title: 'Root Item',
      description: 'contract test',
      userEmail: 'contract@test.dev'
    })

    const res = await request(app).get('/content-items?limit=10')
    expect(res.status).toBe(200)
    const parsed = contentItemSchema.array().safeParse(res.body.data.items)
    if (!parsed.success) {
      console.error(parsed.error.format())
    }
    expect(parsed.success).toBe(true)
  })
})
