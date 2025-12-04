import path from 'node:path'
import fs from 'node:fs/promises'
import request from 'supertest'
import { describe, it, expect, beforeAll } from 'vitest'

const TINY_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAOb1N3cAAAAASUVORK5CYII='

describe('Generator assets upload + serve', () => {
  // Use the shared test artifacts directory established in tests/setup-env.ts
  const artifactsDir = process.env.GENERATOR_ARTIFACTS_DIR ?? path.resolve(__dirname, '../../../../.artifacts-test')

  beforeAll(async () => {
    process.env.NODE_ENV = 'development'
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
    // Allow both relative and absolute URLs (env-dependent)
    expect(uploadRes.body.publicUrl).toMatch(/\/api\/generator\/artifacts\/assets\//)

    const savedPath = path.join(artifactsDir, uploadRes.body.path)
    await expect(fs.stat(savedPath)).resolves.toBeTruthy()

    // Extract relative path from publicUrl (works for both relative and absolute URLs)
    const publicUrl = uploadRes.body.publicUrl as string
    const relativePath = publicUrl.replace(/^https?:\/\/[^/]+/, '')

    const getRes = await request(app)
      .get(relativePath)
      .set('Authorization', 'Bearer bypass-token')
      .expect(200)
    expect(getRes.headers['content-type']).toMatch(/image\/png/)
    expect(getRes.body.length).toBeGreaterThan(0)
  })
})
