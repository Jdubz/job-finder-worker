import { Router } from "express"
import { z } from "zod"
import type {
  GetPromptsResponse,
  UpdatePromptsResponse,
  ResetPromptsResponse,
} from "@shared/types"
import { DEFAULT_PROMPTS } from "@shared/types"
import { asyncHandler } from "../../utils/async-handler"
import { success } from "../../utils/api-response"
import { PromptsRepository } from "./prompts.repository"
import { publicReadPrivateWrite } from "../../middleware/optional-auth"

const promptSchema = z.object({
  resumeGeneration: z.string().min(1),
  coverLetterGeneration: z.string().min(1),
  jobScraping: z.string().min(1),
  jobMatching: z.string().min(1),
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
      const prompts = repository.getPrompts()
      const response: GetPromptsResponse = { prompts }
      res.json(success(response))
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
      const { userEmail } = resetSchema.parse(req.body)
      const saved = repository.savePrompts(DEFAULT_PROMPTS, userEmail)
      const response: ResetPromptsResponse = { prompts: saved }
      res.json(success(response))
    })
  )

  return router
}
