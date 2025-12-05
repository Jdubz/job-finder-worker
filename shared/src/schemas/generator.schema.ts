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
  result: z.record(z.unknown()).optional(),
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
  job: z.record(z.unknown()),
  preferences: z.record(z.unknown()).nullable().optional(),
  personalInfo: z.record(z.unknown()).nullable().optional(),
  status: z.enum(["pending", "processing", "completed", "failed"]),
  resumeUrl: z.string().nullable().optional(),
  coverLetterUrl: z.string().nullable().optional(),
  jobMatchId: z.string().nullable().optional(),
  createdBy: z.string().nullable().optional(),
  steps: z.array(generationStepSchema).nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const generatorArtifactSchema = z.object({
  id: z.string(),
  requestId: z.string(),
  artifactType: z.string(),
  filename: z.string(),
  storagePath: z.string(),
  sizeBytes: z.number().nullable().optional(),
  createdAt: z.string(),
})

export const generatorStartResponseSchema = z.object({
  requestId: z.string(),
  status: z.enum(["pending", "processing", "completed", "failed"]),
  steps: z.array(z.record(z.unknown())).optional(),
  nextStep: z.string().nullable().optional(),
  stepCompleted: z.string().nullable().optional(),
  resumeUrl: z.string().nullable().optional(),
  coverLetterUrl: z.string().nullable().optional(),
})

export const generatorStepResponseSchema = z.object({
  status: z.enum(["pending", "processing", "completed", "failed"]),
  steps: z.array(z.record(z.unknown())).optional(),
  nextStep: z.string().nullable().optional(),
  resumeUrl: z.string().nullable().optional(),
  coverLetterUrl: z.string().nullable().optional(),
})
