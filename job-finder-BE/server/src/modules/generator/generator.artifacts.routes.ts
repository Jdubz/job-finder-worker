import { Router } from 'express'
import fs from 'node:fs'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import mime from 'mime-types'
import { asyncHandler } from '../../utils/async-handler'
import { failure } from '../../utils/api-response'
import { ApiErrorCode } from '@shared/types'
import { storageService, type ArtifactType } from './workflow/services/storage.service'

const VALID_TYPES: ArtifactType[] = ['resume', 'cover-letter', 'image', 'raw']

function sanitizeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9-_.]/g, '')
}

export function buildGeneratorArtifactsRouter() {
  const router = Router()

  router.get(
    '/:requestId/:type/:filename',
    asyncHandler(async (req, res) => {
      const requestId = sanitizeSegment(req.params.requestId)
      const filename = sanitizeSegment(req.params.filename)
      const type = req.params.type as ArtifactType

      if (!VALID_TYPES.includes(type)) {
        res.status(400).json(failure(ApiErrorCode.INVALID_REQUEST, 'Unsupported artifact type'))
        return
      }

      if (!requestId || !filename) {
        res.status(400).json(failure(ApiErrorCode.INVALID_REQUEST, 'Invalid artifact path'))
        return
      }

      const relativePath = path.posix.join(requestId, type, filename)
      const absolutePath = storageService.getAbsolutePath(relativePath)

      try {
        const fileStats = await stat(absolutePath)
        const contentType = mime.lookup(filename) || 'application/octet-stream'

        res.setHeader('Content-Type', contentType)
        res.setHeader('Content-Length', fileStats.size.toString())
        res.setHeader('Cache-Control', 'private, max-age=31536000')
        res.setHeader('Content-Disposition', `inline; filename="${filename}"`)

        const stream = fs.createReadStream(absolutePath)
        stream.on('error', () => {
          res.status(500).json(failure(ApiErrorCode.STORAGE_ERROR, 'Failed to read artifact'))
        })
        stream.pipe(res)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          res.status(404).json(failure(ApiErrorCode.NOT_FOUND, 'Artifact not found'))
          return
        }
        res.status(500).json(failure(ApiErrorCode.STORAGE_ERROR, 'Failed to load artifact'))
      }
    })
  )

  return router
}
