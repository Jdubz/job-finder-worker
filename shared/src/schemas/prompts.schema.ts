import { z } from "zod"

export const promptConfigSchema = z.object({
  resumeGeneration: z.string(),
  coverLetterGeneration: z.string(),
  jobScraping: z.string(),
  jobMatching: z.string(),
})
