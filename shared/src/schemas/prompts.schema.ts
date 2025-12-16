import { z } from "zod"

/**
 * Schema for editable AI prompt templates.
 *
 * NOTE: The formFill prompt has been moved to the job-applicator Electron app.
 * It is no longer stored in the database. See: job-applicator/src/prompts/form-fill-workflow.ts
 */
export const promptConfigSchema = z.object({
  resumeGeneration: z.string(),
  coverLetterGeneration: z.string(),
  jobScraping: z.string(),
  jobMatching: z.string(),
})
