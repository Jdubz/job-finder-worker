import { z } from "zod"
import { promptConfigSchema } from "./prompts.schema"

export const configEntrySchema = z.object({
  id: z.string(),
  payload: z.unknown(),
  updatedAt: z.string(),
  updatedBy: z.string().nullable().optional(),
})

export const configListSchema = z.object({
  configs: z.array(configEntrySchema),
})

const aiProviderSelectionSchema = z.object({
  provider: z.string(),
  interface: z.string(),
  model: z.string(),
})

const aiInterfaceOptionSchema = z.object({
  value: z.string(),
  models: z.array(z.string()),
  enabled: z.boolean(),
  reason: z.string().optional(),
})

const aiProviderOptionSchema = z.object({
  value: z.string(),
  interfaces: z.array(aiInterfaceOptionSchema),
})

const aiSettingsSectionSchema = z.object({
  selected: aiProviderSelectionSchema,
  tasks: z.record(z.unknown()).optional(),
})

export const aiSettingsSchema = z.object({
  worker: aiSettingsSectionSchema,
  documentGenerator: aiSettingsSectionSchema,
  options: z.array(aiProviderOptionSchema),
})

export const matchPolicySchema = z.object({
  minScore: z.number(),
  weights: z.object({
    skillMatch: z.number(),
    experienceMatch: z.number(),
    seniorityMatch: z.number(),
  }),
  seniority: z.record(z.unknown()),
  location: z.record(z.unknown()),
  technology: z.record(z.unknown()),
  salary: z.record(z.unknown()),
  experience: z.record(z.unknown()),
  freshness: z.record(z.unknown()),
  roleFit: z.record(z.unknown()),
  company: z.record(z.unknown()),
})

export const prefilterPolicySchema = z.object({
  title: z.record(z.unknown()),
  freshness: z.record(z.unknown()),
  workArrangement: z.record(z.unknown()),
  employmentType: z.record(z.unknown()),
  salary: z.record(z.unknown()),
  technology: z.record(z.unknown()),
})

export const workerSettingsSchema = z.object({
  scraping: z.record(z.unknown()),
  textLimits: z.record(z.unknown()),
  runtime: z.record(z.unknown()),
})

export const cronJobScheduleSchema = z.object({
  enabled: z.boolean(),
  hours: z.array(z.number()),
  lastRun: z.string().nullable().optional(),
})

export const cronConfigSchema = z.object({
  jobs: z.object({
    scrape: cronJobScheduleSchema,
    maintenance: cronJobScheduleSchema,
    logrotate: cronJobScheduleSchema,
  }),
})

export const personalInfoSchema = z.record(z.unknown())

export const configPayloadSchemaMap = {
  "ai-settings": aiSettingsSchema,
  "ai-prompts": promptConfigSchema,
  "personal-info": personalInfoSchema,
  "prefilter-policy": prefilterPolicySchema,
  "match-policy": matchPolicySchema,
  "worker-settings": workerSettingsSchema,
  "cron-config": cronConfigSchema,
} as const
