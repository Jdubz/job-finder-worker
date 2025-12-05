import express from 'express'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { generatorAssetUploadSchema } from '@shared/types'

vi.mock('../workflow/services/storage.service', () => ({
  storageService: {
    saveAsset: vi.fn(async (_buffer: Buffer, _mime: string, _type: string) => ({
      storagePath: 'assets/test.png',
    })),
    createPublicUrl: vi.fn((path: string) => `http://localhost/${path}`),
    getAbsolutePath: (p: string) => `/tmp/${p}`,
  },
}))

const buildRouters = async () => {
  const { buildGeneratorAssetsRouter } = await import('../generator.assets.routes')
  const app = express()
  app.use(express.json({ limit: '1mb' }))
  app.use('/generator/assets', buildGeneratorAssetsRouter())
  return app
}

describe('generator assets contract (mocked storage)', () => {
  it('returns upload response matching shared schema', async () => {
    const app = await buildRouters()
    const res = await request(app).post('/generator/assets/upload').send({
      type: 'avatar',
      dataUrl:
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAhUBAO8e0b0AAAAASUVORK5CYII=',
    })
    expect(res.status).toBe(200)
    const parsed = generatorAssetUploadSchema.safeParse(res.body)
    if (!parsed.success) {
      console.error(parsed.error.format())
    }
    expect(parsed.success).toBe(true)
  })
})
