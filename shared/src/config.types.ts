import type { PersonalInfo } from "./generator.types"

export interface JobFinderConfigEntry<TPayload = unknown> {
  id: string
  payload: TPayload
  updatedAt: string
  updatedBy?: string | null
}

export interface PromptConfig {
  resumeGeneration: string
  coverLetterGeneration: string
  jobScraping: string
  jobMatching: string
}

// -----------------------------------------------------------
// Core app configuration payloads
// -----------------------------------------------------------

export interface QueueSettings {
  processingTimeoutSeconds: number
  isProcessingEnabled?: boolean // Controls whether the worker processes queue items (defaults to true)
  taskDelaySeconds?: number // Delay between processing queue items (defaults to 0)
}

// -----------------------------------------------------------
// AI Provider Configuration
// -----------------------------------------------------------

/** Supported AI providers */
export type AIProviderType = "codex" | "claude" | "openai" | "gemini"

/** Interface types for connecting to providers */
export type AIInterfaceType = "cli" | "api"

/** Available models per provider and interface */
export const AI_PROVIDER_MODELS = {
  codex: {
    cli: ["o3", "o4-mini", "gpt-4.1", "gpt-4o", "gpt-4o-mini"],
  },
  claude: {
    api: [
      "claude-sonnet-4-5-20250929",
      "claude-sonnet-4-20250514",
      "claude-3-5-sonnet-20241022",
      "claude-3-5-haiku-20241022",
    ],
  },
  openai: {
    api: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"],
  },
  gemini: {
    api: ["gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"],
  },
} as const

export interface AIInterfaceOption {
  value: AIInterfaceType
  models: string[]
  enabled: boolean
  reason?: string
}

export interface AIProviderOption {
  value: AIProviderType
  interfaces: AIInterfaceOption[]
}

/** Selected provider configuration */
export interface AIProviderSelection {
  provider: AIProviderType
  interface: AIInterfaceType
  model: string
}

/** Task names that can have per-task AI provider overrides */
export type AITaskName = "jobMatch" | "companyDiscovery" | "sourceDiscovery"

/** Per-task AI provider override (all fields optional - falls back to section default) */
export interface AITaskConfig {
  provider?: AIProviderType
  interface?: AIInterfaceType
  model?: string | null
}

/** Per-task AI configuration overrides */
export interface AITasksConfig {
  jobMatch?: AITaskConfig | null
  companyDiscovery?: AITaskConfig | null
  sourceDiscovery?: AITaskConfig | null
}

export interface AISettingsSection {
  selected: AIProviderSelection
  /** Per-task overrides (optional - falls back to selected) */
  tasks?: AITasksConfig
}

/** AI Settings with worker and document generator sections */
export interface AISettings {
  worker: AISettingsSection
  documentGenerator: AISettingsSection
  /** Tiered provider/interface/model options validated against CLI/API */
  options: AIProviderOption[]
}

// -----------------------------------------------------------
// Job Match Configuration (scoring preferences)
// -----------------------------------------------------------

export interface CompanyMatchWeights {
  bonuses: {
    remoteFirst: number
    aiMlFocus: number
  }
  sizeAdjustments: {
    largeCompanyBonus: number
    smallCompanyPenalty: number
    largeCompanyThreshold: number
    smallCompanyThreshold: number
  }
  timezoneAdjustments: {
    sameTimezone: number
    diff1to2hr: number
    diff3to4hr: number
    diff5to8hr: number
    diff9plusHr: number
  }
  priorityThresholds: {
    high: number
    medium: number
  }
}

export interface PrefilterPolicy {
  stopList: {
    excludedCompanies: string[]
    excludedKeywords: string[]
    excludedDomains: string[]
  }
  strikeEngine: {
    enabled: boolean
    strikeThreshold: number
    hardRejections: {
      excludedJobTypes?: string[]
      excludedSeniority?: string[]
      excludedCompanies?: string[]
      excludedKeywords?: string[]
      /** Whitelist: Job title MUST contain at least one of these keywords to be considered */
      requiredTitleKeywords?: string[]
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
  }
  technologyRanks: {
    technologies: Record<string, TechnologyRank>
    strikes?: {
      missingAllRequired?: number
      perBadTech?: number
    }
    extractedFromJobs?: number
    version?: string
  }
  version?: string
  updatedBy?: string
}

export interface MatchDealbreakers {
  maxTimezoneDiffHours: number
  blockedLocations: string[]
  requireRemote: boolean
  allowHybridInTimezone: boolean
}

export interface MatchPolicy {
  jobMatch: {
    /** Minimum match score threshold (0-100) */
    minMatchScore: number
    /** Bonus points for Portland office jobs */
    portlandOfficeBonus: number
    /** User's timezone offset from UTC (e.g., -8 for PST) */
    userTimezone: number
    /** Whether to prefer larger companies in scoring */
    preferLargeCompanies: boolean
    /** Whether to generate resume intake data for matches */
    generateIntakeData: boolean
    /** Company-influenced score weights */
    companyWeights?: CompanyMatchWeights
  }
  companyWeights: CompanyMatchWeights
  dealbreakers: MatchDealbreakers
  techPreferences?: Record<string, number>
  version?: string
  updatedBy?: string
}

export type TechnologyRank = {
  rank: "required" | "ok" | "strike" | "fail"
  points?: number
  mentions?: number
}

export interface SchedulerSettings {
  pollIntervalSeconds: number
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
}

// -----------------------------------------------------------
// Config IDs and payload map
// -----------------------------------------------------------

export type JobFinderConfigId =
  | "queue-settings"
  | "ai-settings"
  | "ai-prompts"
  | "personal-info"
  | "prefilter-policy"
  | "match-policy"
  | "scheduler-settings"
  | "worker-settings"

export type JobFinderConfigPayloadMap = {
  "queue-settings": QueueSettings
  "ai-settings": AISettings
  "ai-prompts": PromptConfig
  "personal-info": PersonalInfo
  "prefilter-policy": PrefilterPolicy
  "match-policy": MatchPolicy
  "scheduler-settings": SchedulerSettings
  "worker-settings": WorkerSettings
}

// -----------------------------------------------------------
// Defaults (single source of truth)
// -----------------------------------------------------------

export const DEFAULT_QUEUE_SETTINGS: QueueSettings = {
  processingTimeoutSeconds: 1800,
  isProcessingEnabled: true,
  taskDelaySeconds: 1, // 1 second delay between tasks to avoid rate limits
}

/** Canonical provider options built from AI_PROVIDER_MODELS */
export const AI_PROVIDER_OPTIONS: AIProviderOption[] = Object.entries(AI_PROVIDER_MODELS).map(
  ([provider, interfaces]) => ({
    value: provider as AIProviderType,
    interfaces: Object.entries(interfaces).map(([iface, models]) => ({
      value: iface as AIInterfaceType,
      models: [...models],
      enabled: true,
    })),
  })
)

export const DEFAULT_AI_SELECTION: AIProviderSelection = {
  provider: "codex",
  interface: "cli",
  model: "gpt-4o",
}

export const DEFAULT_AI_SETTINGS: AISettings = {
  worker: {
    selected: { ...DEFAULT_AI_SELECTION },
  },
  documentGenerator: {
    selected: { ...DEFAULT_AI_SELECTION },
  },
  options: AI_PROVIDER_OPTIONS,
}

export const DEFAULT_PERSONAL_INFO: PersonalInfo = {
  name: "",
  email: "",
  accentColor: "#3b82f6",
}

export const DEFAULT_COMPANY_WEIGHTS: CompanyMatchWeights = {
    bonuses: {
      remoteFirst: 15,
      aiMlFocus: 10,
    },
    sizeAdjustments: {
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

export const DEFAULT_PREFILTER_POLICY: PrefilterPolicy = {
  stopList: {
    excludedCompanies: [],
    excludedKeywords: [],
    excludedDomains: [],
  },
  strikeEngine: {
    enabled: true,
    strikeThreshold: 5,
    hardRejections: {
      excludedJobTypes: [],
      excludedSeniority: [],
      excludedCompanies: [],
      excludedKeywords: [],
      requiredTitleKeywords: ["software", "developer", "engineer", "frontend", "full stack", "fullstack"],
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
  },
  technologyRanks: {
    technologies: {},
    strikes: { missingAllRequired: 1, perBadTech: 2 },
  },
}

export const DEFAULT_MATCH_POLICY: MatchPolicy = {
  jobMatch: {
    minMatchScore: 70,
    portlandOfficeBonus: 15,
    userTimezone: -8,
    preferLargeCompanies: true,
    generateIntakeData: true,
    companyWeights: DEFAULT_COMPANY_WEIGHTS,
  },
  companyWeights: DEFAULT_COMPANY_WEIGHTS!,
  dealbreakers: {
    maxTimezoneDiffHours: 8,
    blockedLocations: ["india", "bangalore", "bengaluru", "ist"],
    requireRemote: false,
    allowHybridInTimezone: true,
  },
}

export const DEFAULT_SCHEDULER_SETTINGS: SchedulerSettings = {
  pollIntervalSeconds: 60,
}

export const DEFAULT_PROMPTS: PromptConfig = {
  resumeGeneration: `You are an expert resume writer creating a tailored resume for a specific job.

TARGET ROLE: {{jobTitle}} at {{companyName}}

JOB DESCRIPTION:
{{jobDescription}}

YOUR TASK:
1. Write a compelling professionalSummary (2-3 sentences) tailored to this specific role
2. For each experience entry, write 3-5 achievement-focused highlights that:
   - Use action verbs and quantify impact where possible
   - Emphasize skills/accomplishments relevant to the target role
   - Are concise (one line each, ~10-15 words)
3. Organize skills into 2-4 logical categories relevant to the role
4. Preserve ALL dates, company names, and locations exactly as provided

RESPONSE FORMAT (JSON only, no markdown):
{
  "personalInfo": {
    "name": "string",
    "title": "target role title",
    "summary": "brief tagline",
    "contact": { "email": "", "location": "", "website": "", "linkedin": "", "github": "" }
  },
  "professionalSummary": "2-3 sentence summary tailored to the role",
  "experience": [
    {
      "role": "exact role from input",
      "company": "exact company from input",
      "location": "exact location from input",
      "startDate": "YYYY-MM from input",
      "endDate": "YYYY-MM from input or null if current",
      "highlights": ["achievement 1", "achievement 2", "achievement 3"],
      "technologies": ["tech1", "tech2"]
    }
  ],
  "skills": [
    { "category": "Category Name", "items": ["skill1", "skill2"] }
  ],
  "education": [
    { "institution": "", "degree": "", "field": "", "startDate": "", "endDate": "" }
  ]
}

IMPORTANT:
- Output ONLY valid JSON, no explanations or markdown
- Preserve exact dates, company names, locations from the input data
- Customize highlights and summary for the target role
- Include technologies used at each job`,

  coverLetterGeneration: `You are an expert cover letter writer creating a compelling, personalized letter for {{candidateName}}.

TARGET ROLE: {{jobTitle}} at {{companyName}}

ABOUT THE COMPANY:
{{companyInfo}}

JOB DESCRIPTION:
{{jobDescription}}

CANDIDATE'S RELEVANT SKILLS: {{matchedSkills}}
KEY STRENGTHS TO HIGHLIGHT: {{keyStrengths}}
KEYWORDS TO NATURALLY INCLUDE: {{atsKeywords}}

ADDITIONAL EMPHASIS: {{additionalInstructions}}

YOUR TASK:
Write a cover letter that:
1. Opens with a hook that connects the candidate's specific background to this role
2. Highlights 2-3 most relevant achievements/experiences from the provided data
3. Shows genuine interest in the company using the company info and job description
4. Naturally incorporates the matched skills and keywords where relevant
5. Closes with confidence and a clear call to action
6. Maintains professional but personable tone

RESPONSE FORMAT (JSON only, no markdown):
{
  "greeting": "Dear Hiring Manager," or specific name if known,
  "openingParagraph": "Strong opening that hooks the reader and states intent",
  "bodyParagraphs": [
    "Paragraph connecting specific experience to job requirements",
    "Paragraph highlighting relevant achievements and skills"
  ],
  "closingParagraph": "Express enthusiasm and include call to action",
  "signature": "Sincerely,"
}

CRITICAL RULES:
- Output ONLY valid JSON, no explanations or markdown
- Keep total length to ~300-400 words
- ONLY reference achievements, skills, and experiences from the provided candidate data
- Do NOT invent companies, roles, projects, or achievements not in the input
- Be specific about how the candidate's actual experience relates to their needs
- Avoid generic phrases; use concrete details from the provided data`,

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