import { Router } from "express"
import { z } from "zod"
import type {
  GetPromptsResponse,
  UpdatePromptsResponse,
} from "@shared/types"
import { ApiErrorCode } from "@shared/types"
import { asyncHandler } from "../../utils/async-handler"
import { success, failure } from "../../utils/api-response"
import { PromptsRepository } from "./prompts.repository"
import { publicReadPrivateWrite } from "../../middleware/optional-auth"

const promptSchema = z.object({
  resumeGeneration: z.string().min(1),
  coverLetterGeneration: z.string().min(1),
  jobScraping: z.string().min(1),
  jobMatching: z.string().min(1),
  formFill: z.string().min(1),
})

const updateSchema = z.object({
  prompts: promptSchema,
  userEmail: z.string().email(),
})

const resetSchema = z.object({
  userEmail: z.string().email(),
})

export function buildPromptsRouter() {
  const router = Router()
  const repository = new PromptsRepository()

  // Apply selective auth: public GET, authenticated PUT/POST
  router.use(publicReadPrivateWrite)

  router.get(
    "/",
    asyncHandler((_req, res) => {
      try {
        const prompts = repository.getPrompts()
        const response: GetPromptsResponse = { prompts }
        res.json(success(response))
      } catch (err) {
        const message = err instanceof Error ? err.message : ''
        if (message.includes('not found')) {
          res.status(404).json(failure(
            ApiErrorCode.NOT_FOUND,
            "Prompts configuration 'ai-prompts' not found - must be configured in database"
          ))
          return
        }
        throw err
      }
    })
  )

  router.put(
    "/",
    asyncHandler((req, res) => {
      const { prompts, userEmail } = updateSchema.parse(req.body)
      const saved = repository.savePrompts(prompts, userEmail)
      const response: UpdatePromptsResponse = { prompts: saved }
      res.json(success(response))
    })
  )

  router.post(
    "/reset",
    asyncHandler((req, res) => {
      // Reset is no longer supported - no hardcoded defaults
      // Users must configure prompts manually or restore from a backup
      resetSchema.parse(req.body) // Validate request format
      res.status(400).json(failure(
        ApiErrorCode.INVALID_REQUEST,
        "Reset to defaults is not supported. Prompts must be configured manually in the database."
      ))
    })
  )

  return router
}
