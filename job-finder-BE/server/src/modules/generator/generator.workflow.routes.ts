import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler } from '../../utils/async-handler'
import { success, failure } from '../../utils/api-response'
import { ApiErrorCode } from '@shared/types'
import { GeneratorWorkflowService } from './workflow/generator.workflow.service'
import { GeneratorWorkflowRepository, type GeneratorRequestRecord } from './generator.workflow.repository'

// Shared schema for generator endpoints
const generatorRequestSchema = z.object({
  generateType: z.enum(['resume', 'coverLetter', 'both']),
  job: z.object({
    role: z.string().min(1),
    company: z.string().min(1),
    companyWebsite: z.string().url().optional(),
    jobDescriptionUrl: z.string().url().optional(),
    jobDescriptionText: z.string().optional(),
    location: z.string().optional()
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

// Singleton service instance so generation uses shared dependencies
let serviceInstance: GeneratorWorkflowService | null = null
function getService(): GeneratorWorkflowService {
  if (!serviceInstance) {
    serviceInstance = new GeneratorWorkflowService()
  }
  return serviceInstance
}

export function buildGeneratorWorkflowRouter() {
  const router = Router()
  const service = getService()
  const repo = new GeneratorWorkflowRepository()

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
      const payload = generatorRequestSchema.parse(req.body ?? {})
      const { requestId, steps } = await service.createRequest(payload)

      // Execute the first step synchronously
      const stepResult = await service.runNextStep(requestId, payload)
      if (!stepResult) {
        res.status(500).json(failure(ApiErrorCode.INTERNAL_ERROR, 'Failed to execute first step'))
        return
      }

      res.json(
        success({
          requestId,
          status: stepResult.status,
          steps: stepResult.steps,
          nextStep: stepResult.nextStep,
          stepCompleted: steps[0]?.id, // First step that was completed
          resumeUrl: stepResult.resumeUrl,
          coverLetterUrl: stepResult.coverLetterUrl
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
