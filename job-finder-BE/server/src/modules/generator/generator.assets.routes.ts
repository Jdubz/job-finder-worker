import { Router } from 'express'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import dns from 'node:dns/promises'
import mime from 'mime-types'
import { z } from 'zod'
import { asyncHandler } from '../../utils/async-handler'
import { storageService } from './workflow/services/storage.service'
import { failure } from '../../utils/api-response'
import { ApiErrorCode } from '@shared/types'

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

function isPrivateAddress(ip: string): boolean {
  if (ip.includes(':')) {
    // IPv6 checks
    const normalized = ip.toLowerCase()
    return (
      normalized.startsWith('fc') || // unique local address
      normalized.startsWith('fd') ||
      normalized.startsWith('fe80') || // link-local
      normalized === '::1'
    )
  }

  const parts = ip.split('.').map(Number)
  const [a, b] = parts
  return (
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a === 127 ||
    (a === 169 && b === 254)
  )
}

async function assertSafeUrl(input: string): Promise<URL> {
  const url = new URL(input)
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Only http/https URLs are allowed')
  }

  const hostname = url.hostname
  const results = await dns.lookup(hostname, { all: true, verbatim: false })
  for (const entry of results) {
    if (isPrivateAddress(entry.address)) {
      throw new Error('URL resolves to a private or link-local address')
    }
  }
  return url
}

async function fetchExternal(url: string): Promise<{ mime: string; buffer: Buffer }> {
  const safeUrl = await assertSafeUrl(url)
  const res = await fetch(safeUrl.toString(), { redirect: 'error' })
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

// Public router for serving stored assets (no upload endpoint to avoid unauthenticated writes)
export function buildGeneratorAssetsServeRouter() {
  const router = Router()
  router.get(
    '/*',
    asyncHandler(async (req, res) => {
      const relative = req.params[0]
      if (!relative) {
        res.status(400).json(failure(ApiErrorCode.INVALID_REQUEST, 'Invalid asset path'))
        return
      }

      const safeRelative = path.posix.normalize(relative.replace(/^\/+/, ''))
      if (safeRelative.includes('..')) {
        res.status(400).json(failure(ApiErrorCode.INVALID_REQUEST, 'Invalid asset path'))
        return
      }

      const assetsDir = path.resolve(storageService.getAbsolutePath('assets'))
      const requestedFile = path.resolve(assetsDir, safeRelative)
      if (!requestedFile.startsWith(assetsDir + path.sep) && requestedFile !== assetsDir) {
        res.status(400).json(failure(ApiErrorCode.INVALID_REQUEST, 'Invalid asset path'))
        return
      }

      try {
        const fileStats = await stat(requestedFile)
        const contentType = mime.lookup(requestedFile) || 'application/octet-stream'
        res.setHeader('Content-Type', contentType)
        res.setHeader('Content-Length', fileStats.size.toString())
        res.setHeader('Cache-Control', 'private, max-age=31536000')
        const stream = createReadStream(requestedFile)
        stream.on('error', () => {
          res.status(500).json(failure(ApiErrorCode.STORAGE_ERROR, 'Failed to read asset'))
        })
        stream.pipe(res)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          res.status(404).json(failure(ApiErrorCode.NOT_FOUND, 'Asset not found'))
          return
        }
        res.status(500).json(failure(ApiErrorCode.STORAGE_ERROR, 'Failed to load asset'))
      }
    })
  )
  return router
}
