import path from 'node:path'
import fs from 'node:fs/promises'
import request from 'supertest'
import { describe, it, expect, beforeAll } from 'vitest'

const TINY_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAOb1N3cAAAAASUVORK5CYII='

describe('Generator assets upload + serve', () => {
  const artifactsDir = '/tmp/job-finder-artifacts-test'

  beforeAll(async () => {
    process.env.NODE_ENV = 'development'
    process.env.TEST_AUTH_BYPASS_TOKEN = 'bypass-token'
    process.env.GENERATOR_ARTIFACTS_DIR = artifactsDir
    await fs.rm(artifactsDir, { recursive: true, force: true })
  })

  it('uploads an avatar and serves it back from artifacts assets route', async () => {
    const { buildApp } = await import('../../../app')
    const app = buildApp()

    const uploadRes = await request(app)
      .post('/api/generator/assets/upload')
      .set('Authorization', 'Bearer bypass-token')
      .send({ type: 'avatar', dataUrl: TINY_PNG_DATA_URL })
      .expect(200)

    expect(uploadRes.body.success).toBe(true)
    expect(uploadRes.body.path).toMatch(/^\/assets\//)
    expect(uploadRes.body.publicUrl).toMatch(/\/api\/generator\/artifacts\/assets\//)

    const savedPath = path.join(artifactsDir, uploadRes.body.path)
    await expect(fs.stat(savedPath)).resolves.toBeTruthy()

    const getRes = await request(app)
      .get(uploadRes.body.publicUrl)
      .set('Authorization', 'Bearer bypass-token')
      .expect(200)
    expect(getRes.headers['content-type']).toMatch(/image\/png/)
    expect(getRes.body.length).toBeGreaterThan(0)
  })
})
