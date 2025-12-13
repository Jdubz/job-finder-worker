import { z } from "zod"

/**
 * Schema for editable AI prompt templates.
 *
 * NOTE: formFill contains only the WORKFLOW portion. Safety rules are
 * hardcoded and appended at runtime. See: job-applicator/src/form-fill-safety.ts
 */
export const promptConfigSchema = z.object({
  resumeGeneration: z.string(),
  coverLetterGeneration: z.string(),
  jobScraping: z.string(),
  jobMatching: z.string(),
  /** Workflow instructions only - safety rules appended at runtime */
  formFill: z.string(),
})
