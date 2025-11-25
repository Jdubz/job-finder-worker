import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler } from '../../utils/async-handler'
import { storageService } from './workflow/services/storage.service'

const uploadSchema = z.object({
  type: z.enum(['avatar', 'logo']),
  dataUrl: z.string().url().optional(),
  url: z.string().url().optional()
})

function parseDataUrl(dataUrl: string): { mime: string; buffer: Buffer } {
  const match = dataUrl.match(/^data:(.+);base64,(.+)$/)
  if (!match) {
    throw new Error('Invalid data URL')
  }
  const [, mime, b64] = match
  return { mime, buffer: Buffer.from(b64, 'base64') }
}

async function fetchExternal(url: string): Promise<{ mime: string; buffer: Buffer }> {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Failed to fetch asset: ${res.status}`)
  }
  const mime = res.headers.get('content-type') || 'application/octet-stream'
  const buffer = Buffer.from(await res.arrayBuffer())
  return { mime, buffer }
}

export function buildGeneratorAssetsRouter() {
  const router = Router()

  router.post(
    '/upload',
    asyncHandler(async (req, res) => {
      const parsed = uploadSchema.parse(req.body ?? {})

      let payload: { mime: string; buffer: Buffer }
      if (parsed.dataUrl) {
        payload = parseDataUrl(parsed.dataUrl)
      } else if (parsed.url) {
        payload = await fetchExternal(parsed.url)
      } else {
        return res.status(400).json({ message: 'dataUrl or url is required' })
      }

      const saved = await storageService.saveAsset(payload.buffer, payload.mime, parsed.type)
      const publicUrl = storageService.createPublicUrl(saved.storagePath)

      res.json({
        success: true,
        path: `/${saved.storagePath}`.replace(/\\/g, '/'),
        publicUrl
      })
    })
  )

  return router
}
