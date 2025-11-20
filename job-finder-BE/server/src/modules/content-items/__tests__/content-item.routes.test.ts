import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { buildContentItemRouter } from '../content-item.routes'
import { getDb } from '../../../db/sqlite'

const app = express()
app.use(express.json())
app.use('/content-items', buildContentItemRouter())

const basePayload = {
  userEmail: 'owner@example.com',
  itemData: {
    userId: 'route-user-1',
    title: 'Route Root',
    visibility: 'published'
  }
}

describe('content-item routes', () => {
  beforeEach(() => {
    const db = getDb()
    db.prepare('DELETE FROM content_items').run()
  })

  it('creates items and lists them in a nested tree', async () => {
    const createRoot = await request(app).post('/content-items').send(basePayload).expect(201)
    const parentId = createRoot.body.data.item.id as string

    await request(app)
      .post('/content-items')
      .send({
        ...basePayload,
        itemData: {
          ...basePayload.itemData,
          title: 'Route Child',
          parentId
        }
      })
      .expect(201)

    const listResponse = await request(app)
      .get(`/content-items?userId=${basePayload.itemData.userId}&includeDrafts=true`)
      .expect(200)

    expect(listResponse.body.success).toBe(true)
    expect(listResponse.body.data.items).toHaveLength(1)
    expect(listResponse.body.data.items[0].children).toHaveLength(1)
    expect(listResponse.body.data.items[0].children[0].title).toBe('Route Child')
  })

  it('updates and deletes items via the API surface', async () => {
    const created = await request(app).post('/content-items').send(basePayload).expect(201)
    const itemId = created.body.data.item.id

    const update = await request(app)
      .patch(`/content-items/${itemId}`)
      .send({
        userEmail: basePayload.userEmail,
        itemData: {
          title: 'Route Updated',
          location: 'Test Location'
        }
      })
      .expect(200)

    expect(update.body.data.item.title).toBe('Route Updated')
    expect(update.body.data.item.location).toBe('Test Location')

    await request(app).delete(`/content-items/${itemId}`).expect(200)
    await request(app)
      .get(`/content-items/${itemId}`)
      .expect(404)
  })

  it('reorders root items and moves children between parents', async () => {
    const rootA = await request(app).post('/content-items').send(basePayload).expect(201)
    const rootB = await request(app)
      .post('/content-items')
      .send({
        ...basePayload,
        itemData: { ...basePayload.itemData, title: 'Route Root B' }
      })
      .expect(201)

    await request(app)
      .post(`/content-items/${rootB.body.data.item.id}/reorder`)
      .send({
        userEmail: basePayload.userEmail,
        parentId: null,
        orderIndex: 0
      })
      .expect(200)

    const orderedRoots = await request(app)
      .get(`/content-items?userId=${basePayload.itemData.userId}&includeDrafts=true`)
      .expect(200)
    expect(orderedRoots.body.data.items.map((item: { title: string }) => item.title)).toEqual([
      'Route Root B',
      'Route Root'
    ])

    const child = await request(app)
      .post('/content-items')
      .send({
        ...basePayload,
        itemData: { ...basePayload.itemData, title: 'Route Child' }
      })
      .expect(201)

    await request(app)
      .post(`/content-items/${child.body.data.item.id}/reorder`)
      .send({
        userEmail: basePayload.userEmail,
        parentId: rootA.body.data.item.id,
        orderIndex: 0
      })
      .expect(200)

    const nested = await request(app)
      .get(`/content-items?userId=${basePayload.itemData.userId}&includeDrafts=true`)
      .expect(200)
    expect(nested.body.data.items[1].children[0].title).toBe('Route Child')
  })
})
