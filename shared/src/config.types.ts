import type { TimestampLike } from "./firestore.types"

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
  maxRetries: number
  retryDelaySeconds: number
  processingTimeout: number
  updatedAt?: TimestampLike
  updatedBy?: string | null
}

export type AIProvider = "claude" | "openai" | "gemini"

export interface ModelTuning {
  maxTokens?: number
  temperature?: number
}

export interface AISettings {
  provider: AIProvider
  model: string
  minMatchScore: number
  costBudgetDaily: number
  generateIntakeData?: boolean
  portlandOfficeBonus?: number
  userTimezone?: number
  preferLargeCompanies?: boolean
  models?: Record<string, ModelTuning>
  maxTokens?: number
  temperature?: number
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

export type JobFinderConfigPayloadMap = {
  "stop-list": StopList
  "queue-settings": QueueSettings
  "ai-settings": AISettings
  "ai-prompts": PromptConfig
  "personal-info": Record<string, unknown>
  "job-filters": JobFiltersConfig
  "technology-ranks": TechnologyRanksConfig
  "scheduler-settings": SchedulerSettings
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
  maxRetries: 3,
  retryDelaySeconds: 300,
  processingTimeout: 600,
}

export const DEFAULT_AI_SETTINGS: AISettings = {
  provider: "claude",
  model: "claude-sonnet-4",
  minMatchScore: 70,
  costBudgetDaily: 10,
  generateIntakeData: true,
  portlandOfficeBonus: 15,
  userTimezone: -8,
  preferLargeCompanies: true,
}

export const DEFAULT_JOB_FILTERS: JobFiltersConfig = {
  enabled: true,
  strikeThreshold: 3,
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
