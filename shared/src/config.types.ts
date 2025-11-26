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

  coverLetterGeneration: `You are an expert cover letter writer creating a compelling, personalized letter.

TARGET ROLE: {{jobTitle}} at {{companyName}}

JOB DESCRIPTION:
{{jobDescription}}

CANDIDATE EXPERIENCE:
{{userExperience}}

YOUR TASK:
Write a cover letter that:
1. Opens with a hook that connects the candidate's background to this specific role
2. Highlights 2-3 most relevant achievements/experiences for this position
3. Shows genuine interest in the company and role (use details from job description)
4. Closes with confidence and a clear call to action
5. Maintains professional but personable tone

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

IMPORTANT:
- Output ONLY valid JSON, no explanations or markdown
- Keep total length to ~300-400 words
- Be specific about how experience relates to their needs
- Avoid generic phrases; show you understand this specific role`,

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
