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

export const generatorRequestRecordSchema = z.object({
  id: z.string(),
  generateType: z.enum(["resume", "coverLetter", "both"]),
  job: z.record(z.string(), z.unknown()),
  preferences: z.record(z.string(), z.unknown()).nullable().optional(),
  personalInfo: z.record(z.string(), z.unknown()).nullable().optional(),
  status: z.enum(["pending", "processing", "completed", "failed"]),
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
  status: z.enum(["pending", "processing", "completed", "failed"]),
  steps: z.array(z.record(z.string(), z.unknown())).optional(),
  nextStep: z.string().nullable().optional(),
  stepCompleted: z.string().nullable().optional(),
  resumeUrl: z.string().nullable().optional(),
  coverLetterUrl: z.string().nullable().optional(),
})

export const generatorStepResponseSchema = z.object({
  status: z.enum(["pending", "processing", "completed", "failed"]),
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
  status: z.enum(["pending", "processing", "completed", "failed"]),
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
