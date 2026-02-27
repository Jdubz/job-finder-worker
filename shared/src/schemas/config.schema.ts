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

// -----------------------------
// Prefilter policy
// -----------------------------
const prefilterTitleSchema = z.object({
  requiredKeywords: z.array(z.string()),
  excludedKeywords: z.array(z.string()),
  synonyms: z.record(z.string(), z.array(z.string())).optional(),
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
  remoteScore: z.number(),
  relocationScore: z.number(),
  unknownTimezoneScore: z.number(),
  relocationAllowed: z.boolean(),
})

// Skill relationships (synonyms, implies, parallels) are managed by taxonomy in DB
const skillMatchConfigSchema = z.object({
  baseMatchScore: z.number(),
  yearsMultiplier: z.number(),
  maxYearsBonus: z.number(),
  missingScore: z.number(),
  missingIgnore: z.array(z.string()),
  analogScore: z.number(),
  maxBonus: z.number(),
  maxPenalty: z.number(),
})

const salaryConfigSchema = z.object({
  minimum: z.number().nullable(),
  target: z.number().nullable(),
  belowTargetScore: z.number(),
  belowTargetMaxPenalty: z.number(),
  missingSalaryScore: z.number(),
  meetsTargetScore: z.number(),
  equityScore: z.number(),
  contractScore: z.number(),
})

// Experience scoring is DISABLED - all fields optional for backwards compatibility
const experienceConfigSchema = z.object({
  relevantExperienceStart: z.string().nullable().optional(),
}).optional()

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
  // Required so bad configs fail fast instead of later during generation.
  applicationInfo: z.string().min(1, { message: "applicationInfo is required" }),
}).strict()

export const configPayloadSchemaMap = {
  "ai-prompts": promptConfigSchema,
  "personal-info": personalInfoSchema,
  "prefilter-policy": prefilterPolicySchema,
  "match-policy": matchPolicySchema,
  "worker-settings": workerSettingsSchema,
  "cron-config": cronConfigSchema,
} as const
