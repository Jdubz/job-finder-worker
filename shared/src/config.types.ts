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
  pollIntervalSeconds?: number // How often the worker polls for new items (defaults to 60)
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
    cli: ["gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"],
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
// Title Filter Configuration (simple pre-filter)
// -----------------------------------------------------------

/** Simple title-based pre-filter configuration */
export interface TitleFilterConfig {
  /** Keywords that MUST appear in title (at least one) */
  requiredKeywords: string[]
  /** Keywords that immediately reject a job */
  excludedKeywords: string[]
}

// -----------------------------------------------------------
// Scoring Configuration (deterministic scoring engine)
// -----------------------------------------------------------

/** Weight distribution for scoring components */
export interface ScoringWeights {
  /** Weight for skill alignment (0-100) */
  skillMatch: number
  /** Weight for experience fit (0-100) */
  experienceMatch: number
  /** Weight for seniority alignment (0-100) */
  seniorityMatch: number
}

/** Seniority level preferences */
export interface SeniorityConfig {
  /** Preferred seniority levels (e.g., ["senior", "staff", "lead"]) */
  preferred: string[]
  /** Acceptable seniority levels (e.g., ["mid"]) */
  acceptable: string[]
  /** Rejected seniority levels - hard reject (e.g., ["junior", "intern"]) */
  rejected: string[]
  /** Score adjustment for preferred seniority match (positive) */
  preferredScore: number
  /** Score adjustment for acceptable seniority (usually 0) */
  acceptableScore: number
  /** Score adjustment for rejected seniority (large negative, triggers hard reject) */
  rejectedScore: number
}

/** Location and remote work preferences */
export interface LocationConfig {
  /** Allow fully remote positions */
  allowRemote: boolean
  /** Allow hybrid positions */
  allowHybrid: boolean
  /** Allow onsite-only positions */
  allowOnsite: boolean
  /** User's timezone offset from UTC (e.g., -8 for PST) */
  userTimezone: number
  /** Maximum timezone difference allowed (hours) */
  maxTimezoneDiffHours: number
  /** Score adjustment per hour of timezone difference (negative) */
  perHourScore: number
  /** Score adjustment for hybrid in same city (positive) */
  hybridSameCityScore: number
  /** User's city for hybrid matching */
  userCity?: string
  /** Score adjustment for remote positions (positive) */
  remoteScore?: number
  /** Score adjustment when relocation required (negative) */
  relocationScore?: number
  /** Score adjustment for unknown timezone (negative) */
  unknownTimezoneScore?: number
}

/** Technology stack preferences */
export interface TechnologyConfig {
  /** Required technologies - must have at least one */
  required: string[]
  /** Preferred technologies - bonus points */
  preferred: string[]
  /** Disliked technologies - penalty points */
  disliked: string[]
  /** Rejected technologies - hard reject */
  rejected: string[]
  /** Score adjustment per required technology found (positive) */
  requiredScore: number
  /** Score adjustment per preferred technology found (positive) */
  preferredScore: number
  /** Score adjustment per disliked technology found (negative) */
  dislikedScore: number
  /** Score adjustment when no required tech found (negative) */
  missingRequiredScore?: number
}

/** Salary preferences */
export interface SalaryConfig {
  /** Minimum acceptable salary (hard floor) */
  minimum: number | null
  /** Target/ideal salary */
  target: number | null
  /** Score adjustment per $10k below target (negative) */
  belowTargetScore: number
  /** Score adjustment for positions with equity (positive) */
  equityScore?: number
  /** Score adjustment for contract positions (negative) */
  contractScore?: number
}

/** Experience level preferences */
export interface ExperienceConfig {
  /** User's years of experience */
  userYears: number
  /** Maximum years required by job before rejection */
  maxRequired: number
  /** Score adjustment per year user is overqualified (negative) */
  overqualifiedScore: number
}

/** Freshness/age scoring configuration */
export interface FreshnessConfig {
  /** Days old to still be considered "fresh" */
  freshDays: number
  /** Score adjustment for fresh listings (positive) */
  freshScore: number
  /** Days old before considered "stale" */
  staleDays: number
  /** Score adjustment for stale listings (negative) */
  staleScore: number
  /** Days old before considered "very stale" */
  veryStaleDays: number
  /** Score adjustment for very stale listings (negative) */
  veryStaleScore: number
  /** Score adjustment for detected reposts (negative) */
  repostScore: number
}

/** Role fit scoring configuration (dynamic role categories) */
export interface RoleFitConfig {
  /** Preferred role types (e.g., ["backend", "ml-ai", "devops"]) */
  preferred: string[]
  /** Acceptable role types - neutral (e.g., ["fullstack", "data"]) */
  acceptable: string[]
  /** Penalized role types (e.g., ["frontend-only", "consulting"]) */
  penalized: string[]
  /** Rejected role types - hard reject (e.g., ["management", "clearance-required"]) */
  rejected: string[]
  /** Score adjustment per preferred role type found (positive) */
  preferredScore: number
  /** Score adjustment per penalized role type found (negative) */
  penalizedScore: number
}

/** Company signal scoring configuration */
export interface CompanyConfig {
  /** Score adjustment for companies in user's preferred city (positive) */
  preferredCityScore: number
  /** User's preferred city for office bonus */
  preferredCity?: string
  /** Score adjustment for remote-first companies (positive) */
  remoteFirstScore: number
  /** Score adjustment for companies focused on AI/ML (positive) */
  aiMlFocusScore: number
  /** Score adjustment for large companies above threshold (positive) */
  largeCompanyScore: number
  /** Score adjustment for small companies below threshold (negative) */
  smallCompanyScore: number
  /** Employee count threshold for "large" company */
  largeCompanyThreshold: number
  /** Employee count threshold for "small" company */
  smallCompanyThreshold: number
  /** Score adjustment for startups - overrides smallCompanyScore (positive or 0) */
  startupScore: number
}

/** Complete match policy configuration (unified scoring config) */
export interface MatchPolicy {
  /** Minimum score threshold to pass (0-100) */
  minScore: number
  /** Weight distribution for scoring components */
  weights: ScoringWeights
  /** Seniority level preferences */
  seniority: SeniorityConfig
  /** Location and remote work preferences */
  location: LocationConfig
  /** Technology stack preferences */
  technology: TechnologyConfig
  /** Salary preferences */
  salary: SalaryConfig
  /** Experience level preferences */
  experience: ExperienceConfig
  /** Freshness/listing age scoring */
  freshness: FreshnessConfig
  /** Role fit scoring (backend, ML, etc.) */
  roleFit: RoleFitConfig
  /** Company signal scoring */
  company: CompanyConfig
}

/** @deprecated Use MatchPolicy instead */
export type ScoringConfig = Omit<MatchPolicy, "freshness" | "roleFit" | "company">

// -----------------------------------------------------------
// Score Breakdown Types (returned by scoring engine)
// -----------------------------------------------------------

/** A single score adjustment with category, reason, and points */
export interface ScoreAdjustment {
  /** Category of the adjustment (e.g., "seniority", "location", "technology") */
  category: string
  /** Human-readable reason for the adjustment */
  reason: string
  /** Points added or subtracted */
  points: number
}

/** Detailed breakdown of score calculation */
export interface ScoreBreakdown {
  /** Starting baseline score (usually 50) */
  baseScore: number
  /** Final calculated score (0-100) */
  finalScore: number
  /** List of score adjustments applied */
  adjustments: ScoreAdjustment[]
  /** Whether the job passed the minimum score threshold */
  passed: boolean
  /** Reason for rejection if passed is false */
  rejectionReason: string | null
}

// -----------------------------------------------------------
// AI Extraction Result (stored with job listing)
// -----------------------------------------------------------

/** Work arrangement classification */
export type WorkArrangement = "remote" | "hybrid" | "onsite" | "unknown"

/** Employment type classification */
export type EmploymentType = "full-time" | "part-time" | "contract" | "unknown"

/** Seniority level classification */
export type SeniorityLevel = "junior" | "mid" | "senior" | "staff" | "lead" | "principal" | "unknown"

/** AI-extracted structured data from job posting */
export interface JobExtractionResult {
  /** Detected seniority level */
  seniority: SeniorityLevel
  /** Remote/hybrid/onsite classification */
  workArrangement: WorkArrangement
  /** Detected timezone (UTC offset) */
  timezone: number | null
  /** City if onsite/hybrid */
  city: string | null
  /** Parsed minimum salary */
  salaryMin: number | null
  /** Parsed maximum salary */
  salaryMax: number | null
  /** Minimum years of experience required */
  experienceMin: number | null
  /** Maximum years of experience required */
  experienceMax: number | null
  /** Detected technologies/skills */
  technologies: string[]
  /** Employment type */
  employmentType: EmploymentType

  // Freshness fields
  /** Days since job was posted */
  daysOld: number | null
  /** Whether the job appears to be a repost */
  isRepost: boolean

  // Location fields
  /** Whether relocation is explicitly required */
  relocationRequired: boolean

  // Compensation fields
  /** Whether compensation includes equity */
  includesEquity: boolean
  /** Whether position is contract */
  isContract: boolean

  // Seniority fields
  /** Whether role includes people management */
  isManagement: boolean
  /** Whether role is a technical lead */
  isLead: boolean

  // Role types (dynamic list for role fit scoring)
  /** Role types detected for this position (e.g., ["backend", "ml-ai", "devops"]) */
  roleTypes: string[]
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
  | "title-filter"
  | "match-policy"
  | "worker-settings"

export type JobFinderConfigPayloadMap = {
  "queue-settings": QueueSettings
  "ai-settings": AISettings
  "ai-prompts": PromptConfig
  "personal-info": PersonalInfo
  "title-filter": TitleFilterConfig
  "match-policy": MatchPolicy
  "worker-settings": WorkerSettings
}

// -----------------------------------------------------------
// Defaults (single source of truth)
// -----------------------------------------------------------

export const DEFAULT_QUEUE_SETTINGS: QueueSettings = {
  processingTimeoutSeconds: 1800,
  isProcessingEnabled: true,
  taskDelaySeconds: 1, // 1 second delay between tasks to avoid rate limits
  pollIntervalSeconds: 60, // Poll for new items every 60 seconds
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
  provider: "gemini",
  interface: "api",
  model: "gemini-2.0-flash",
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
  city: "",
  timezone: null,
  relocationAllowed: false,
}

export const DEFAULT_TITLE_FILTER: TitleFilterConfig = {
  requiredKeywords: [
    "software",
    "developer",
    "engineer",
    "frontend",
    "backend",
    "fullstack",
    "full-stack",
    "full stack",
  ],
  excludedKeywords: [
    "intern",
    "internship",
    "wordpress",
    "php",
    "sales",
    "marketing",
    "recruiter",
  ],
}

// No DEFAULT_MATCH_POLICY - fail loud on missing config to prevent silent gaps

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
