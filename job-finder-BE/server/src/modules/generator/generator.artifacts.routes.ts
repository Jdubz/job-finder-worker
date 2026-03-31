import { Router, type Request } from 'express'
import fs from 'node:fs'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import mime from 'mime-types'
import { asyncHandler } from '../../utils/async-handler'
import { failure } from '../../utils/api-response'
import { ApiErrorCode } from '@shared/types'
import { storageService } from './workflow/services/storage.service'
import { GeneratorWorkflowRepository } from './generator.workflow.repository'
import { type AuthenticatedRequest, type AuthenticatedUser } from '../../middleware/auth'
import { ApiHttpError } from '../../middleware/api-error'

function sanitizeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9-_.]/g, '')
}

function getAuthenticatedUser(req: Request): AuthenticatedUser & { email: string } {
  const user = (req as AuthenticatedRequest).user
  if (!user || !user.email) {
    throw new ApiHttpError(ApiErrorCode.UNAUTHORIZED, 'Missing authenticated user', { status: 401 })
  }
  return user as AuthenticatedUser & { email: string }
}

export function buildGeneratorArtifactsRouter() {
  const router = Router()
  const repo = new GeneratorWorkflowRepository()

  // Human-readable path: /:date/:run/:filename
  // e.g., /2024-01-15/run-abc123/josh-wentworth_software-engineer_resume.pdf
  router.get(
    '/:date/:run/:filename',
    asyncHandler(async (req, res) => {
      const user = getAuthenticatedUser(req)
      const date = sanitizeSegment(req.params.date)
      const run = sanitizeSegment(req.params.run)
      const filename = sanitizeSegment(req.params.filename)

      if (!date || !run || !filename) {
        res.status(400).json(failure(ApiErrorCode.INVALID_REQUEST, 'Invalid artifact path'))
        return
      }

      // Validate date format (YYYY-MM-DD) and ensure it's a valid calendar date
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) !== date) {
        res.status(400).json(failure(ApiErrorCode.INVALID_REQUEST, 'Invalid date format'))
        return
      }

      // Verify ownership: the run segment is the requestId — check that the user owns it
      const requestId = run
      const request = repo.getRequest(user.uid, requestId)
      if (!request) {
        res.status(404).json(failure(ApiErrorCode.NOT_FOUND, 'Artifact not found'))
        return
      }

      const relativePath = path.posix.join(date, run, filename)
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
