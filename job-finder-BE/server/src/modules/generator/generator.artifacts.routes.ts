import { Router } from 'express'
import { asyncHandler } from '../../utils/async-handler'
import { failure } from '../../utils/api-response'
import { ApiErrorCode } from '@shared/types'
import { storageService } from './workflow/services/storage.service'

function sanitizeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9-_.]/g, '')
}

export function buildGeneratorArtifactsRouter() {
  const router = Router()

  // New human-readable path: /:date/:folder/:filename
  // e.g., /2024-01-15/acme_software-engineer/josh-wentworth_acme_software-engineer_resume.pdf
  router.get(
    '/:date/:folder/:filename',
    asyncHandler(async (req, res) => {
      const date = sanitizeSegment(req.params.date)
      const folder = sanitizeSegment(req.params.folder)
      const filename = sanitizeSegment(req.params.filename)

      if (!date || !folder || !filename) {
        res.status(400).json(failure(ApiErrorCode.INVALID_REQUEST, 'Invalid artifact path'))
        return
      }

      // Validate date format (YYYY-MM-DD) and ensure it's a valid calendar date
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) !== date) {
        res.status(400).json(failure(ApiErrorCode.INVALID_REQUEST, 'Invalid date format'))
        return
      }

      const relativePath = path.posix.join(date, folder, filename)
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
