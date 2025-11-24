import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler } from '../../utils/async-handler'
import { success, failure } from '../../utils/api-response'
import { ApiErrorCode } from '@shared/types'
import { GeneratorWorkflowService } from './workflow/generator.workflow.service'
import { GeneratorWorkflowRepository, type GeneratorRequestRecord } from './generator.workflow.repository'

const generateSchema = z.object({
  generateType: z.enum(['resume', 'coverLetter', 'both']),
  job: z.object({
    role: z.string().min(1),
    company: z.string().min(1),
    companyWebsite: z.string().url().optional(),
    jobDescriptionUrl: z.string().url().optional(),
    jobDescriptionText: z.string().optional()
  }),
  preferences: z
    .object({
      style: z.enum(['modern', 'traditional', 'technical', 'executive']).optional(),
      emphasize: z.array(z.string()).optional()
    })
    .optional(),
  date: z.string().optional(),
  jobMatchId: z.string().optional()
})

export function buildGeneratorWorkflowRouter() {
  const router = Router()
  const service = new GeneratorWorkflowService()
  const repo = new GeneratorWorkflowRepository()

  router.post(
    '/generate',
    asyncHandler(async (req, res) => {
      const payload = generateSchema.parse(req.body ?? {})
      const result = await service.generate(payload)
      if (!result.success) {
        res.status(500).json(failure(ApiErrorCode.INTERNAL_ERROR, result.message ?? 'Generation failed'))
        return
      }

      res.json(
        success({
          success: true,
          documentUrl: result.resumeUrl ?? result.coverLetterUrl,
          resumeUrl: result.resumeUrl,
          coverLetterUrl: result.coverLetterUrl,
          generationId: result.requestId
        })
      )
    })
  )

  router.get(
    '/requests',
    asyncHandler((_req, res) => {
      const documents = repo.listRequests().map((request: GeneratorRequestRecord) => ({
        ...request,
        artifacts: repo.listArtifacts(request.id)
      }))
      res.json(
        success({
          requests: documents,
          count: documents.length
        })
      )
    })
  )

  router.post(
    '/start',
    asyncHandler(async (req, res) => {
      const payload = startSchema.parse(req.body ?? {})
      const requestId = await service.createRequest(payload)
      const request = repo.getRequest(requestId)
      res.status(202).json(
        success({
          requestId,
          status: request?.status ?? 'processing'
        })
      )
    })
  )

  router.post(
    '/step/:id',
    asyncHandler(async (req, res) => {
      const requestId = req.params.id
      const stepResult = await service.runNextStep(requestId)
      if (!stepResult) {
        res.status(404).json(failure(ApiErrorCode.NOT_FOUND, 'Generator request not found or already completed'))
        return
      }
      res.json(success(stepResult))
    })
  )

  return router
}
const startSchema = z.object({
  generateType: z.enum(['resume', 'coverLetter', 'both']),
  job: z.object({
    role: z.string().min(1),
    company: z.string().min(1),
    companyWebsite: z.string().url().optional(),
    jobDescriptionUrl: z.string().url().optional(),
    jobDescriptionText: z.string().optional()
  }),
  preferences: z
    .object({
      style: z.enum(['modern', 'traditional', 'technical', 'executive']).optional(),
      emphasize: z.array(z.string()).optional()
    })
    .optional(),
  date: z.string().optional(),
  jobMatchId: z.string().optional()
})
