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

// (deprecated) QueueSettings have been merged into WorkerSettings.runtime

// -----------------------------------------------------------
// AI Provider Configuration
// -----------------------------------------------------------

/** Supported AI providers */
export type AIProviderType = "codex" | "claude" | "openai" | "gemini"

/** Interface types for connecting to providers */
export type AIInterfaceType = "cli" | "api"

/** Agent task types - abstract categories describing the nature of AI work */
export type AgentTaskType = "extraction" | "analysis" | "document"

/** Agent ID format: "{provider}.{interface}" (e.g., "gemini.cli", "codex.cli") */
export type AgentId = `${AIProviderType}.${AIInterfaceType}`

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

/** Interface availability option (used by backend to report CLI/API availability) */
export interface AIInterfaceOption {
  value: AIInterfaceType
  models: string[]
  enabled: boolean
  reason?: string
}

/** Provider availability option (used by backend to report provider availability) */
export interface AIProviderOption {
  value: AIProviderType
  interfaces: AIInterfaceOption[]
}

export type AgentScope = "worker" | "backend"

export interface AgentRuntimeState {
  enabled: boolean
  reason: string | null
}

export interface AgentAuthRequirements {
  /** Interface mode used for auth checks (cli or api) */
  type: AIInterfaceType
  /** Environment variables required for this agent */
  requiredEnv: string[]
  /** Files whose existence satisfies auth (e.g., CLI credentials) */
  requiredFiles?: string[]
}

/** Configuration for a single AI agent (provider/interface combination) */
export interface AgentConfig {
  /** AI provider type */
  provider: AIProviderType
  /** Interface type (CLI or API) */
  interface: AIInterfaceType
  /** Default model for this agent */
  defaultModel: string
  /** Maximum daily usage units */
  dailyBudget: number
  /** Current usage (reset at midnight) */
  dailyUsage: number
  /** Scope-specific runtime state (auth/health per service) */
  runtimeState: Record<AgentScope, AgentRuntimeState>
  /** Auth requirements checked on AgentManager initialization */
  authRequirements: AgentAuthRequirements
}

/** AI Settings with agent manager configuration */
export interface AISettings {
  /** Configured agents keyed by agent ID (e.g., "gemini.cli", "codex.cli") */
  agents: Partial<Record<AgentId, AgentConfig>>

  /** Fallback chains per task type - ordered list of agent IDs to try */
  taskFallbacks: Record<AgentTaskType, AgentId[]>

  /** Model cost rates - how much budget each model consumes (default: 1.0) */
  modelRates: Record<string, number>

  /** Document generator selection (until backend uses AgentManager) */
  documentGenerator: {
    selected: {
      provider: AIProviderType
      interface: AIInterfaceType
      model: string
    }
  }

  /** Provider availability metadata (populated by backend) */
  options: AIProviderOption[]
}

// -----------------------------------------------------------
// PreFilter Policy Configuration (structured data pre-filter)
// -----------------------------------------------------------
/**
 * Pre-filter policy for rejecting obviously unsuitable jobs BEFORE AI extraction.
 *
 * IMPORTANT: PreFilter settings should be MORE PERMISSIVE than match-policy settings.
 * The goal is to catch obvious non-matches early while avoiding false positives.
 *
 * Example relationship:
 * - prefilter-policy.salary.minimum: $80,000 (absolute floor - definitely not a match)
 * - match-policy.salary.minimum: $100,000 (nuanced floor - rejected in scoring)
 *
 * If a field's data is not available from the API, the job PASSES that check.
 * Missing data is never a reason to reject - it just means we need AI extraction.
 */

/** Title keyword filtering (same as TitleFilterConfig for consistency) */
export interface PreFilterTitleConfig {
  /** Keywords that MUST appear in title (at least one). Empty = no requirement. */
  requiredKeywords: string[]
  /** Keywords that immediately reject a job */
  excludedKeywords: string[]
}

/** Job freshness/age filtering */
export interface PreFilterFreshnessConfig {
  /**
   * Maximum age in days before rejection. Should be HIGHER than match-policy.freshness.veryStaleDays.
   * Jobs older than this are definitely stale. Set to 0 to disable.
   * Example: 60 days (prefilter) vs 30 days (match-policy veryStaleDays)
   */
  maxAgeDays: number
}

/** Work arrangement filtering */
export interface PreFilterWorkArrangementConfig {
  /**
   * Allow remote positions. Should match or be MORE permissive than match-policy.
   * If false, jobs with explicit is_remote=true or "Remote" location are rejected.
   */
  allowRemote: boolean
  /**
   * Allow hybrid positions. Should match or be MORE permissive than match-policy.
   * If false, jobs with explicit "Hybrid" work arrangement are rejected.
   */
  allowHybrid: boolean
  /**
   * Allow onsite positions. Should match or be MORE permissive than match-policy.
   * If false, jobs with explicit "Onsite" work arrangement are rejected.
   * NOTE: Consider setting true here even if match-policy is false, to let AI
   * extract nuances like timezone compatibility or "onsite with remote option".
   */
  allowOnsite: boolean
  /** Whether the user is willing to relocate for onsite/hybrid roles */
  willRelocate: boolean
  /** User's preferred location for onsite/hybrid roles (e.g., "Portland, OR"). Also used for timezone derivation. */
  userLocation: string
  /** Maximum allowed timezone difference in hours. When set, enables city-based timezone comparison using userLocation. */
  maxTimezoneDiffHours?: number
  /**
   * Keywords that indicate remote work arrangement (checked in location, offices, metadata).
   * Defaults to ["remote", "distributed", "anywhere", "worldwide"] if not specified.
   */
  remoteKeywords?: string[]
  /**
   * If true, treat unknown work arrangement as potentially onsite and apply location filter.
   * Jobs with location data outside userLocation will be rejected even if work type is unknown.
   * Default: false (unknown = skip location check, following "missing data = pass" principle)
   */
  treatUnknownAsOnsite?: boolean
}

/** Employment type filtering */
export interface PreFilterEmploymentTypeConfig {
  /** Allow full-time positions */
  allowFullTime: boolean
  /** Allow part-time positions */
  allowPartTime: boolean
  /**
   * Allow contract positions. Consider setting true even if you prefer full-time,
   * as "contract-to-hire" might be acceptable after AI review.
   */
  allowContract: boolean
}

/** Salary floor filtering */
export interface PreFilterSalaryConfig {
  /**
   * Absolute minimum salary floor. Should be LOWER than match-policy.salary.minimum.
   * Jobs with salary data below this are definitely not a match.
   * Example: $80,000 (prefilter) vs $100,000 (match-policy minimum)
   * Set to null to disable salary pre-filtering.
   */
  minimum: number | null
}

/** Complete pre-filter policy configuration */
export interface PreFilterPolicy {
  /** Title keyword filtering */
  title: PreFilterTitleConfig
  /** Job freshness/age filtering */
  freshness: PreFilterFreshnessConfig
  /** Work arrangement filtering */
  workArrangement: PreFilterWorkArrangementConfig
  /** Employment type filtering */
  employmentType: PreFilterEmploymentTypeConfig
  /** Salary floor filtering */
  salary: PreFilterSalaryConfig
}

// -----------------------------------------------------------
// Scoring Configuration (deterministic scoring engine)
// -----------------------------------------------------------

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

/** Skill/technology matching with experience weighting */
export interface SkillMatchConfig {
  /** Base points per matched skill */
  baseMatchScore: number
  /** Multiplier per year of experience for a matched skill */
  yearsMultiplier: number
  /** Max years counted per skill (caps experience bonus) */
  maxYearsBonus: number
  /** Penalty per missing job skill (negative) */
  missingScore: number
  /** Points when an analog skill is present */
  analogScore: number
  /** Cap on total bonus from skill matching */
  maxBonus: number
  /** Cap on total penalty from missing skills */
  maxPenalty: number
  /** Groups of equivalent skills (each inner array is a group) */
  analogGroups: string[][]
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
  /** Seniority level preferences */
  seniority: SeniorityConfig
  /** Location and remote work preferences */
  location: LocationConfig
  /** Skill/technology matching */
  skillMatch: SkillMatchConfig
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
    maxHtmlSampleLength: number // Max HTML length for AI selector discovery (default: 20000)
    fetchDelaySeconds?: number // Delay between detail page fetches to avoid rate limiting (default: 1)
  }
  /** Source health tracking (optional) */
  health?: {
    maxConsecutiveFailures: number
    healthCheckIntervalSeconds: number
  }
  /** Cache TTLs (optional) */
  cache?: {
    companyInfoTtlSeconds: number
    sourceConfigTtlSeconds: number
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
  /** Runtime/queue loop settings */
  runtime: {
    processingTimeoutSeconds: number
    isProcessingEnabled: boolean
    taskDelaySeconds: number
    pollIntervalSeconds: number
    scrapeConfig?: {
      target_matches?: number | null
      max_sources?: number | null
      source_ids?: string[]
    }
    /** Reason the worker was stopped (set automatically on critical errors) */
    stopReason?: string | null
  }
}

// -----------------------------------------------------------
// Cron Scheduler Settings
// -----------------------------------------------------------

export interface CronJobSchedule {
  enabled: boolean
  hours: number[] // integers 0-23 in container/local timezone
  lastRun?: string | null // ISO timestamp of last execution
}

export interface CronConfig {
  jobs: {
    scrape: CronJobSchedule
    maintenance: CronJobSchedule
    logrotate: CronJobSchedule
    /** Reset agent daily budgets and re-enable quota-exhausted agents at midnight */
    agentReset: CronJobSchedule
  }
}

// -----------------------------------------------------------
// Config IDs and payload map
// -----------------------------------------------------------

export type JobFinderConfigId =
  | "ai-settings"
  | "ai-prompts"
  | "personal-info"
  | "prefilter-policy"
  | "match-policy"
  | "worker-settings"
  | "cron-config"

export type JobFinderConfigPayloadMap = {
  "ai-settings": AISettings
  "ai-prompts": PromptConfig
  "personal-info": PersonalInfo
  "prefilter-policy": PreFilterPolicy
  "match-policy": MatchPolicy
  "worker-settings": WorkerSettings
  "cron-config": CronConfig
}
