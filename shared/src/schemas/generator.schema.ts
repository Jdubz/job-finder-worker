import { z } from "zod"
import { timestampJsonSchema } from "./timestamp.schema"

export const generationStepSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  status: z.enum(["pending", "in_progress", "completed", "failed", "skipped"]),
  startedAt: timestampJsonSchema.optional(),
  completedAt: timestampJsonSchema.optional(),
  duration: z.number().optional(),
  result: z.record(z.string(), z.unknown()).optional(),
  error: z
    .object({
      message: z.string(),
      code: z.string().optional(),
    })
    .optional(),
})

/** Status enum including awaiting_review for document review workflow */
export const generatorRequestStatusSchema = z.enum([
  "pending",
  "processing",
  "awaiting_review",
  "completed",
  "failed",
])

export const generatorRequestRecordSchema = z.object({
  id: z.string(),
  generateType: z.enum(["resume", "coverLetter", "both"]),
  job: z.record(z.string(), z.unknown()),
  preferences: z.record(z.string(), z.unknown()).nullable().optional(),
  personalInfo: z.record(z.string(), z.unknown()).nullable().optional(),
  status: generatorRequestStatusSchema,
  resumeUrl: z.string().nullable().optional(),
  coverLetterUrl: z.string().nullable().optional(),
  jobMatchId: z.string().nullable().optional(),
  createdBy: z.string().nullable().optional(),
  steps: z.array(generationStepSchema).nullable().optional(),
  createdAt: timestampJsonSchema,
  updatedAt: timestampJsonSchema,
})

export const generatorArtifactSchema = z.object({
  id: z.string(),
  requestId: z.string(),
  artifactType: z.string(),
  filename: z.string(),
  storagePath: z.string(),
  sizeBytes: z.number().nullable().optional(),
  createdAt: timestampJsonSchema,
})

export const generatorStartResponseSchema = z.object({
  requestId: z.string(),
  status: generatorRequestStatusSchema,
  steps: z.array(z.record(z.string(), z.unknown())).optional(),
  nextStep: z.string().nullable().optional(),
  stepCompleted: z.string().nullable().optional(),
  resumeUrl: z.string().nullable().optional(),
  coverLetterUrl: z.string().nullable().optional(),
})

export const generatorStepResponseSchema = z.object({
  status: generatorRequestStatusSchema,
  steps: z.array(z.record(z.string(), z.unknown())).optional(),
  nextStep: z.string().nullable().optional(),
  resumeUrl: z.string().nullable().optional(),
  coverLetterUrl: z.string().nullable().optional(),
})

export const generatorAssetUploadSchema = z.object({
  path: z.string(),
  publicUrl: z.string().optional(),
})

/**
 * Schema for a single generator document (request record with URLs)
 * Used by job-applicator to display generated documents
 */
export const generatorDocumentSchema = z.object({
  id: z.string(),
  generateType: z.enum(["resume", "coverLetter", "both"]),
  status: generatorRequestStatusSchema,
  resumeUrl: z.string().nullable().optional(),
  coverLetterUrl: z.string().nullable().optional(),
  jobMatchId: z.string().nullable().optional(),
  createdAt: timestampJsonSchema,
  updatedAt: timestampJsonSchema.optional(),
})

/**
 * Schema for GET /generator/job-matches/:id/documents response
 */
export const generatorDocumentsResponseSchema = z.object({
  requests: z.array(generatorDocumentSchema),
  count: z.number(),
})

/**
 * Schema for GET /generator/requests/:id response
 */
export const generatorSingleDocumentResponseSchema = z.object({
  request: generatorDocumentSchema,
})

// ============================================================================
// Document Review Schemas
// ============================================================================

/** Document type for review workflow */
export const reviewDocumentTypeSchema = z.enum(["resume", "coverLetter"])

/** Contact info nested in resume personal info */
export const resumeContactSchema = z.object({
  email: z.string(),
  location: z.string().optional(),
  website: z.string().optional(),
  linkedin: z.string().optional(),
  github: z.string().optional(),
})

/** Personal info section of resume */
export const resumePersonalInfoSchema = z.object({
  name: z.string(),
  title: z.string(),
  summary: z.string(),
  contact: resumeContactSchema,
})

/** Experience entry in resume */
export const resumeExperienceSchema = z.object({
  company: z.string(),
  role: z.string(),
  location: z.string().optional(),
  startDate: z.string(),
  endDate: z.string().nullable(),
  highlights: z.array(z.string()),
  technologies: z.array(z.string()).optional(),
})

/** Skill category in resume */
export const resumeSkillSchema = z.object({
  category: z.string(),
  items: z.array(z.string()),
})

/** Education entry in resume */
export const resumeEducationSchema = z.object({
  institution: z.string(),
  degree: z.string(),
  field: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
})

/** Project entry in resume (gap-filling only) */
export const resumeProjectSchema = z.object({
  name: z.string(),
  description: z.string(),
  highlights: z.array(z.string()).optional(),
  technologies: z.array(z.string()).optional(),
  link: z.string().optional(),
})

/**
 * Schema for ResumeContent - AI-generated resume structure
 */
export const resumeContentSchema = z.object({
  personalInfo: resumePersonalInfoSchema,
  professionalSummary: z.string(),
  experience: z.array(resumeExperienceSchema),
  projects: z.array(resumeProjectSchema).optional(),
  skills: z.array(resumeSkillSchema).optional(),
  education: z.array(resumeEducationSchema).optional(),
})

/**
 * Schema for CoverLetterContent - AI-generated cover letter structure
 */
export const coverLetterContentSchema = z.object({
  greeting: z.string(),
  openingParagraph: z.string(),
  bodyParagraphs: z.array(z.string()),
  closingParagraph: z.string(),
  signature: z.string(),
})

/**
 * Schema for GET /generator/requests/:id/draft response
 * Returns draft content awaiting user review
 */
export const draftContentResponseSchema = z.object({
  requestId: z.string(),
  documentType: reviewDocumentTypeSchema,
  content: z.union([resumeContentSchema, coverLetterContentSchema]),
  status: z.literal("awaiting_review"),
})

/**
 * Schema for POST /generator/requests/:id/submit-review request body
 */
export const submitReviewRequestSchema = z.object({
  documentType: reviewDocumentTypeSchema,
  content: z.union([resumeContentSchema, coverLetterContentSchema]),
})

/**
 * Schema for POST /generator/requests/:id/submit-review response
 */
export const submitReviewResponseSchema = z.object({
  nextStep: z.string().nullable().optional(),
  status: generatorRequestStatusSchema,
  steps: z.array(generationStepSchema).optional(),
  resumeUrl: z.string().nullable().optional(),
  coverLetterUrl: z.string().nullable().optional(),
})
