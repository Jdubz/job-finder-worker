import { z } from "zod"
import { timestampJsonSchema } from "./timestamp.schema"

export const structuredLogEntrySchema = z.object({
  category: z.string(),
  action: z.string(),
  message: z.string(),
  requestId: z.string().optional(),
  sessionId: z.string().optional(),
  queueItemId: z.string().optional(),
  queueItemType: z.string().optional(),
  pipelineStage: z.string().optional(),
  http: z
    .object({
      method: z.string().optional(),
      url: z.string().optional(),
      path: z.string().optional(),
      statusCode: z.number().optional(),
      userAgent: z.string().optional(),
      remoteIp: z.string().optional(),
      ip: z.string().optional(),
      duration: z.number().optional(),
    })
    .optional(),
  details: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
  error: z
    .object({
      type: z.string(),
      message: z.string(),
      stack: z.string().optional(),
    })
    .optional(),
})

export const fileLogEntrySchema = structuredLogEntrySchema.extend({
  severity: z.enum(["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]),
  timestamp: z.union([timestampJsonSchema, z.string()]),
  environment: z.string(),
  service: z.string(),
  version: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
})
