import type { TimestampLike } from "./time.types"

export interface JobFinderConfigEntry<TPayload = unknown> {
  id: string
  payload: TPayload
  updatedAt: string
  updatedBy?: string | null
  name?: string | null
}

export interface PromptConfig {
  resumeGeneration: string
  coverLetterGeneration: string
  jobScraping: string
  jobMatching: string
  updatedAt?: TimestampLike
  updatedBy?: string | null
}

// -----------------------------------------------------------
// Core app configuration payloads
// -----------------------------------------------------------

export interface StopList {
  excludedCompanies: string[]
  excludedKeywords: string[]
  excludedDomains: string[]
  updatedAt?: TimestampLike
  updatedBy?: string | null
}

export interface QueueSettings {
  processingTimeoutSeconds: number
  updatedAt?: TimestampLike
  updatedBy?: string | null
}

export type AIProvider = "claude" | "openai" | "gemini"

export interface AISettings {
  provider: AIProvider
  model: string
  minMatchScore: number
  generateIntakeData?: boolean
  portlandOfficeBonus?: number
  userTimezone?: number
  preferLargeCompanies?: boolean
  updatedAt?: TimestampLike
  updatedBy?: string | null
}

export interface JobFiltersConfig {
  enabled: boolean
  strikeThreshold: number
  hardRejections: {
    excludedJobTypes?: string[]
    excludedSeniority?: string[]
    excludedCompanies?: string[]
    excludedKeywords?: string[]
    minSalaryFloor?: number
    rejectCommissionOnly?: boolean
  }
  remotePolicy: {
    allowRemote?: boolean
    allowHybridPortland?: boolean
    allowOnsite?: boolean
  }
  salaryStrike: {
    enabled?: boolean
    threshold?: number
    points?: number
  }
  experienceStrike: {
    enabled?: boolean
    minPreferred?: number
    points?: number
  }
  seniorityStrikes?: Record<string, number>
  qualityStrikes: {
    minDescriptionLength?: number
    shortDescriptionPoints?: number
    buzzwords?: string[]
    buzzwordPoints?: number
  }
  ageStrike: {
    enabled?: boolean
    strikeDays?: number
    rejectDays?: number
    points?: number
  }
  updatedAt?: TimestampLike
  updatedBy?: string | null
}

export type TechnologyRank = {
  rank: "required" | "ok" | "strike" | "fail"
  points?: number
  mentions?: number
}

export interface TechnologyRanksConfig {
  technologies: Record<string, TechnologyRank>
  strikes?: {
    missingAllRequired?: number
    perBadTech?: number
  }
  extractedFromJobs?: number
  version?: string
  updatedAt?: TimestampLike
  updatedBy?: string | null
}

export interface SchedulerSettings {
  pollIntervalSeconds: number
  updatedAt?: TimestampLike
  updatedBy?: string | null
}

// -----------------------------------------------------------
// Company Scoring Configuration
// -----------------------------------------------------------

export interface CompanyScoringConfig {
  /** Company tier thresholds (points needed for each tier) */
  tierThresholds: {
    s: number // S-tier (default: 150)
    a: number // A-tier (default: 100)
    b: number // B-tier (default: 70)
    c: number // C-tier (default: 50)
    // Below C threshold = D-tier
  }
  /** Priority bonuses for company scoring */
  priorityBonuses: {
    portlandOffice: number // Bonus for Portland office (default: 50)
    remoteFirst: number // Bonus for remote-first companies (default: 15)
    aiMlFocus: number // Bonus for AI/ML-focused companies (default: 10)
    techStackMax: number // Maximum points from tech stack alignment (default: 100)
  }
  /** Match score adjustments based on company attributes */
  matchAdjustments: {
    largeCompanyBonus: number // Bonus for large companies (default: 10)
    smallCompanyPenalty: number // Penalty for small companies/startups (default: -5)
    largeCompanyThreshold: number // Employee count for "large" (default: 10000)
    smallCompanyThreshold: number // Employee count for "small" (default: 100)
  }
  /** Timezone-based score adjustments */
  timezoneAdjustments: {
    sameTimezone: number // Bonus for same timezone (default: 5)
    diff1to2hr: number // Penalty for 1-2 hour difference (default: -2)
    diff3to4hr: number // Penalty for 3-4 hour difference (default: -5)
    diff5to8hr: number // Penalty for 5-8 hour difference (default: -10)
    diff9plusHr: number // Penalty for 9+ hour difference (default: -15)
  }
  /** Match score priority thresholds */
  priorityThresholds: {
    high: number // Score threshold for high priority (default: 85)
    medium: number // Score threshold for medium priority (default: 70)
  }
  updatedAt?: TimestampLike
  updatedBy?: string | null
}

// -----------------------------------------------------------
// Worker Operational Settings
// -----------------------------------------------------------

export interface WorkerSettings {
  /** HTTP/Scraping settings */
  scraping: {
    requestTimeoutSeconds: number // HTTP request timeout (default: 30)
    rateLimitDelaySeconds: number // Delay between requests (default: 2)
    maxRetries: number // Maximum retries for failed requests (default: 3)
    maxHtmlSampleLength: number // Max HTML length for AI selector discovery (default: 20000)
    maxHtmlSampleLengthSmall: number // Smaller HTML sample for faster processing (default: 15000)
  }
  /** Source health tracking */
  health: {
    maxConsecutiveFailures: number // Failures before auto-disabling source (default: 5)
    healthCheckIntervalSeconds: number // Seconds between health checks (default: 3600)
  }
  /** Cache TTLs */
  cache: {
    companyInfoTtlSeconds: number // Company info cache TTL (default: 86400 = 24h)
    sourceConfigTtlSeconds: number // Source config cache TTL (default: 3600 = 1h)
  }
  /** Text processing limits */
  textLimits: {
    minCompanyPageLength: number // Min chars for valid company page (default: 200)
    minSparseCompanyInfoLength: number // Threshold for "sparse" cached info (default: 100)
    maxIntakeTextLength: number // Max length for intake data text fields (default: 500)
    maxIntakeDescriptionLength: number // Max length for description in intake (default: 2000)
    maxIntakeFieldLength: number // Max length for most intake fields (default: 400)
    maxDescriptionPreviewLength: number // Max description length for remote keyword search (default: 500)
    maxCompanyInfoTextLength: number // Max length for company info text (default: 1000)
  }
  updatedAt?: TimestampLike
  updatedBy?: string | null
}

// -----------------------------------------------------------
// Config IDs and payload map
// -----------------------------------------------------------

export type JobFinderConfigId =
  | "stop-list"
  | "queue-settings"
  | "ai-settings"
  | "ai-prompts"
  | "personal-info"
  | "job-filters"
  | "technology-ranks"
  | "scheduler-settings"
  | "company-scoring"
  | "worker-settings"

export type JobFinderConfigPayloadMap = {
  "stop-list": StopList
  "queue-settings": QueueSettings
  "ai-settings": AISettings
  "ai-prompts": PromptConfig
  "personal-info": Record<string, unknown>
  "job-filters": JobFiltersConfig
  "technology-ranks": TechnologyRanksConfig
  "scheduler-settings": SchedulerSettings
  "company-scoring": CompanyScoringConfig
  "worker-settings": WorkerSettings
}

// -----------------------------------------------------------
// Defaults (single source of truth)
// -----------------------------------------------------------

export const DEFAULT_STOP_LIST: StopList = {
  excludedCompanies: [],
  excludedKeywords: [],
  excludedDomains: [],
}

export const DEFAULT_QUEUE_SETTINGS: QueueSettings = {
  processingTimeoutSeconds: 1800,
}

export const DEFAULT_AI_SETTINGS: AISettings = {
  provider: "claude",
  model: "claude-sonnet-4",
  minMatchScore: 70,
  generateIntakeData: true,
  portlandOfficeBonus: 15,
  userTimezone: -8,
  preferLargeCompanies: true,
}

export const DEFAULT_JOB_FILTERS: JobFiltersConfig = {
  enabled: true,
  strikeThreshold: 5,
  hardRejections: {
    excludedJobTypes: [],
    excludedSeniority: [],
    excludedCompanies: [],
    excludedKeywords: [],
    minSalaryFloor: 100000,
    rejectCommissionOnly: true,
  },
  remotePolicy: {
    allowRemote: true,
    allowHybridPortland: true,
    allowOnsite: false,
  },
  salaryStrike: {
    enabled: true,
    threshold: 150000,
    points: 2,
  },
  experienceStrike: {
    enabled: true,
    minPreferred: 6,
    points: 1,
  },
  seniorityStrikes: {},
  qualityStrikes: {
    minDescriptionLength: 200,
    shortDescriptionPoints: 1,
    buzzwords: [],
    buzzwordPoints: 1,
  },
  ageStrike: {
    enabled: true,
    strikeDays: 1,
    rejectDays: 7,
    points: 1,
  },
}

export const DEFAULT_TECH_RANKS: TechnologyRanksConfig = {
  technologies: {},
  strikes: { missingAllRequired: 1, perBadTech: 2 },
}

export const DEFAULT_SCHEDULER_SETTINGS: SchedulerSettings = {
  pollIntervalSeconds: 60,
}

export const DEFAULT_PROMPTS: PromptConfig = {
  resumeGeneration: `You are an expert resume writer. Generate a professional resume based on the following information:

Job Description: {{jobDescription}}
Job Title: {{jobTitle}}
Company: {{companyName}}

User Experience:
{{userExperience}}

User Skills:
{{userSkills}}

Additional Instructions: {{additionalInstructions}}

Create a tailored resume that highlights relevant experience and skills for this specific role.`,

  coverLetterGeneration: `You are an expert cover letter writer. Generate a compelling cover letter based on:

Job Description: {{jobDescription}}
Job Title: {{jobTitle}}
Company: {{companyName}}

User Experience:
{{userExperience}}

Match Reason: {{matchReason}}

Additional Instructions: {{additionalInstructions}}

Write a personalized cover letter that demonstrates enthusiasm and fit for the role.`,

  jobScraping: `Extract job posting information from the provided HTML content.

HTML Content: {{htmlContent}}

Extract and return structured data including:
- Job Title
- Company Name
- Location
- Job Type (Full-time, Part-time, Contract, etc.)
- Salary Range (if available)
- Job Description
- Required Skills
- Qualifications
- Benefits

Return the data in JSON format.`,

  jobMatching: `Analyze the job match score and provide reasoning.

Job Description: {{jobDescription}}
User Resume: {{userResume}}
User Skills: {{userSkills}}

Evaluate:
1. Skills alignment (technical and soft skills)
2. Experience relevance
3. Role fit
4. Growth potential

Provide:
- Match score (0-100)
- Match reason (why this is a good fit)
- Strengths (what makes the candidate strong)
- Concerns (potential gaps or mismatches)
- Customization recommendations (what to emphasize)`
}

export const DEFAULT_COMPANY_SCORING: CompanyScoringConfig = {
  tierThresholds: {
    s: 150,
    a: 100,
    b: 70,
    c: 50,
  },
  priorityBonuses: {
    portlandOffice: 50,
    remoteFirst: 15,
    aiMlFocus: 10,
    techStackMax: 100,
  },
  matchAdjustments: {
    largeCompanyBonus: 10,
    smallCompanyPenalty: -5,
    largeCompanyThreshold: 10000,
    smallCompanyThreshold: 100,
  },
  timezoneAdjustments: {
    sameTimezone: 5,
    diff1to2hr: -2,
    diff3to4hr: -5,
    diff5to8hr: -10,
    diff9plusHr: -15,
  },
  priorityThresholds: {
    high: 85,
    medium: 70,
  },
}

export const DEFAULT_WORKER_SETTINGS: WorkerSettings = {
  scraping: {
    requestTimeoutSeconds: 30,
    rateLimitDelaySeconds: 2,
    maxRetries: 3,
    maxHtmlSampleLength: 20000,
    maxHtmlSampleLengthSmall: 15000,
  },
  health: {
    maxConsecutiveFailures: 5,
    healthCheckIntervalSeconds: 3600,
  },
  cache: {
    companyInfoTtlSeconds: 86400,
    sourceConfigTtlSeconds: 3600,
  },
  textLimits: {
    minCompanyPageLength: 200,
    minSparseCompanyInfoLength: 100,
    maxIntakeTextLength: 500,
    maxIntakeDescriptionLength: 2000,
    maxIntakeFieldLength: 400,
    maxDescriptionPreviewLength: 500,
    maxCompanyInfoTextLength: 1000,
  },
}
