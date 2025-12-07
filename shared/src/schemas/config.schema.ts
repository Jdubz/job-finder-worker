import { z } from "zod"
import { promptConfigSchema } from "./prompts.schema"
import { timestampJsonSchema } from "./timestamp.schema"

export const configEntrySchema = z.object({
  id: z.string(),
  payload: z.unknown(),
  updatedAt: timestampJsonSchema,
  updatedBy: z.string().nullable().optional(),
})

export const configListSchema = z.object({
  configs: z.array(configEntrySchema),
})

const aiProviderSelectionSchema = z.object({
  provider: z.enum(["codex", "claude", "openai", "gemini"]),
  interface: z.enum(["cli", "api"]),
  model: z.string(),
})

const aiInterfaceOptionSchema = z.object({
  value: z.enum(["cli", "api"]),
  models: z.array(z.string()),
  enabled: z.boolean(),
  reason: z.string().optional(),
})

const aiProviderOptionSchema = z.object({
  value: z.enum(["codex", "claude", "openai", "gemini"]),
  interfaces: z.array(aiInterfaceOptionSchema),
})

const agentRuntimeStateSchema = z.object({
  enabled: z.boolean(),
  reason: z.string().nullable(),
})

const agentAuthRequirementsSchema = z.object({
  type: z.enum(["cli", "api"]),
  requiredEnv: z.array(z.string()).min(1),
  requiredFiles: z.array(z.string()).optional(),
})

const agentConfigSchema = z.object({
  provider: z.enum(["codex", "claude", "openai", "gemini"]),
  interface: z.enum(["cli", "api"]),
  defaultModel: z.string(),
  dailyBudget: z.number(),
  dailyUsage: z.number(),
  runtimeState: z.object({
    worker: agentRuntimeStateSchema,
    backend: agentRuntimeStateSchema,
  }),
  authRequirements: agentAuthRequirementsSchema,
})

export const aiSettingsSchema = z.object({
  agents: z.record(z.string(), agentConfigSchema).refine((value) => Object.keys(value).length > 0, {
    message: "At least one agent must be configured",
  }),
  taskFallbacks: z.object({
    extraction: z.array(z.string()).min(1),
    analysis: z.array(z.string()).min(1),
    document: z.array(z.string()).min(1),
  }),
  modelRates: z.record(z.string(), z.number()),
  /** @deprecated - kept for backwards compatibility */
  documentGenerator: z.object({
    selected: aiProviderSelectionSchema.optional(),
  }).optional(),
  options: z.array(aiProviderOptionSchema),
})

// -----------------------------
// Prefilter policy
// -----------------------------
const prefilterTitleSchema = z.object({
  requiredKeywords: z.array(z.string()),
  excludedKeywords: z.array(z.string()),
})

const prefilterFreshnessSchema = z.object({
  maxAgeDays: z.number(),
})

const prefilterWorkArrangementSchema = z
  .object({
    allowRemote: z.boolean(),
    allowHybrid: z.boolean(),
    allowOnsite: z.boolean(),
    willRelocate: z.boolean(),
    userLocation: z.string(),
    maxTimezoneDiffHours: z.number().optional(),
  })
  .superRefine((val, ctx) => {
    if (!val.willRelocate && val.userLocation.trim() === "") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "userLocation required when relocation is not allowed",
        path: ["userLocation"],
      })
    }
  })

const prefilterEmploymentTypeSchema = z.object({
  allowFullTime: z.boolean(),
  allowPartTime: z.boolean(),
  allowContract: z.boolean(),
})

const prefilterSalarySchema = z.object({
  minimum: z.number().nullable(),
})

export const prefilterPolicySchema = z.object({
  title: prefilterTitleSchema,
  freshness: prefilterFreshnessSchema,
  workArrangement: prefilterWorkArrangementSchema,
  employmentType: prefilterEmploymentTypeSchema,
  salary: prefilterSalarySchema,
})

// -----------------------------
// Match policy (scoring config)
// -----------------------------
const seniorityConfigSchema = z.object({
  preferred: z.array(z.string()),
  acceptable: z.array(z.string()),
  rejected: z.array(z.string()),
  preferredScore: z.number(),
  acceptableScore: z.number(),
  rejectedScore: z.number(),
})

const locationConfigSchema = z.object({
  allowRemote: z.boolean(),
  allowHybrid: z.boolean(),
  allowOnsite: z.boolean(),
  userTimezone: z.number(),
  maxTimezoneDiffHours: z.number(),
  perHourScore: z.number(),
  hybridSameCityScore: z.number(),
  userCity: z.string().optional(),
  remoteScore: z.number().optional(),
  relocationScore: z.number().optional(),
  unknownTimezoneScore: z.number().optional(),
})

const skillMatchConfigSchema = z.object({
  baseMatchScore: z.number(),
  yearsMultiplier: z.number(),
  maxYearsBonus: z.number(),
  missingScore: z.number(),
  analogScore: z.number(),
  maxBonus: z.number(),
  maxPenalty: z.number(),
  analogGroups: z.array(z.array(z.string())),
})

const salaryConfigSchema = z.object({
  minimum: z.number().nullable(),
  target: z.number().nullable(),
  belowTargetScore: z.number(),
  equityScore: z.number().optional(),
  contractScore: z.number().optional(),
})

const experienceConfigSchema = z.object({
  maxRequired: z.number(),
  overqualifiedScore: z.number(),
  relevantExperienceStart: z.string().nullable().optional(),
})

const freshnessConfigSchema = z.object({
  freshDays: z.number(),
  freshScore: z.number(),
  staleDays: z.number(),
  staleScore: z.number(),
  veryStaleDays: z.number(),
  veryStaleScore: z.number(),
  repostScore: z.number(),
})

const roleFitConfigSchema = z.object({
  preferred: z.array(z.string()),
  acceptable: z.array(z.string()),
  penalized: z.array(z.string()),
  rejected: z.array(z.string()),
  preferredScore: z.number(),
  penalizedScore: z.number(),
})

const companyConfigSchema = z.object({
  preferredCityScore: z.number(),
  preferredCity: z.string().optional(),
  remoteFirstScore: z.number(),
  aiMlFocusScore: z.number(),
  largeCompanyScore: z.number(),
  smallCompanyScore: z.number(),
  largeCompanyThreshold: z.number(),
  smallCompanyThreshold: z.number(),
  startupScore: z.number(),
})

export const matchPolicySchema = z.object({
  minScore: z.number(),
  seniority: seniorityConfigSchema,
  location: locationConfigSchema,
  skillMatch: skillMatchConfigSchema,
  salary: salaryConfigSchema,
  experience: experienceConfigSchema,
  freshness: freshnessConfigSchema,
  roleFit: roleFitConfigSchema,
  company: companyConfigSchema,
})

// -----------------------------
// Worker settings
// -----------------------------
const scrapeConfigSchema = z
  .object({
    target_matches: z.number().nullable().optional(),
    max_sources: z.number().nullable().optional(),
    source_ids: z.array(z.string()).optional(),
  })
  .optional()

export const workerSettingsSchema = z.object({
  scraping: z.object({
    requestTimeoutSeconds: z.number(),
    maxHtmlSampleLength: z.number(),
    fetchDelaySeconds: z.number().optional(),
  }),
  health: z
    .object({
      maxConsecutiveFailures: z.number(),
      healthCheckIntervalSeconds: z.number(),
    })
    .optional(),
  cache: z
    .object({
      companyInfoTtlSeconds: z.number(),
      sourceConfigTtlSeconds: z.number(),
    })
    .optional(),
  textLimits: z.object({
    minCompanyPageLength: z.number(),
    minSparseCompanyInfoLength: z.number(),
    maxIntakeTextLength: z.number(),
    maxIntakeDescriptionLength: z.number(),
    maxIntakeFieldLength: z.number(),
    maxDescriptionPreviewLength: z.number(),
    maxCompanyInfoTextLength: z.number(),
  }),
  runtime: z.object({
    processingTimeoutSeconds: z.number(),
    isProcessingEnabled: z.boolean(),
    taskDelaySeconds: z.number(),
    pollIntervalSeconds: z.number(),
    scrapeConfig: scrapeConfigSchema,
  }),
})

export const cronJobScheduleSchema = z.object({
  enabled: z.boolean(),
  hours: z.array(z.number().int().min(0).max(23)),
  lastRun: timestampJsonSchema.nullable().optional(),
})

export const cronConfigSchema = z.object({
  jobs: z.object({
    scrape: cronJobScheduleSchema,
    maintenance: cronJobScheduleSchema,
    logrotate: cronJobScheduleSchema,
    agentReset: cronJobScheduleSchema,
  }),
})

export const personalInfoSchema = z.object({
  name: z.string(),
  email: z.string(),
  city: z.string().optional(),
  timezone: z.number().nullable().optional(),
  relocationAllowed: z.boolean().optional(),
  phone: z.string().optional(),
  location: z.string().optional(),
  website: z.string().optional(),
  github: z.string().optional(),
  linkedin: z.string().optional(),
  summary: z.string().optional(),
  avatar: z.string().optional(),
  logo: z.string().optional(),
  accentColor: z.string().optional(),
})

export const configPayloadSchemaMap = {
  "ai-settings": aiSettingsSchema,
  "ai-prompts": promptConfigSchema,
  "personal-info": personalInfoSchema,
  "prefilter-policy": prefilterPolicySchema,
  "match-policy": matchPolicySchema,
  "worker-settings": workerSettingsSchema,
  "cron-config": cronConfigSchema,
} as const
