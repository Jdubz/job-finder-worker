/**
 * Job Listing Types
 *
 * Used by both portfolio (TypeScript) and job-finder (Python via Pydantic)
 *
 * IMPORTANT: When modifying these types, also update:
 * - Python models in job-finder/src/job_finder/scrapers/base.py
 * - Python models in job-finder/src/job_finder/ai/matcher.py
 * - Database schema expectations in both projects
 */

import type { TimestampLike } from "./time.types"
import type { ScoreBreakdown } from "./config.types"

/**
 * Full analysis result from AI job matching.
 *
 * This is stored in job_listings.analysis_result as JSON and contains
 * all the details about why a job did or didn't match.
 */
export interface JobAnalysisResult {
  /** Job title being analyzed */
  jobTitle: string

  /** Company name */
  jobCompany: string

  /** Job URL */
  jobUrl: string

  /** Job location */
  location?: string | null

  /** Salary range if available */
  salaryRange?: string | null

  /** Overall match score (0-100) */
  matchScore: number

  /** Skills that matched job requirements */
  matchedSkills: string[]

  /** Skills/requirements missing from profile */
  missingSkills: string[]

  /** How well experience level matches */
  experienceMatch: string

  /** Key strengths for this application */
  keyStrengths: string[]

  /** Why this role fits well */
  matchReasons: string[]

  /** Potential concerns or gaps */
  potentialConcerns: string[]

  /** Deterministic scoring result with detailed breakdown */
  scoringResult?: ScoreBreakdown | null

  /** Specific recommendations for customizing application */
  customizationRecommendations?: Record<string, unknown>

  /** Resume customization data */
  resumeIntakeData?: ResumeIntakeData | null
}

/**
 * Status of a job listing in the pipeline.
 *
 * Note: There is no "filtered" status - jobs that fail prefilter are never
 * created as listings. Filtering happens at intake before listing creation.
 *
 * - pending: Job listing created, waiting to be processed
 * - analyzing: Currently being AI analyzed
 * - analyzed: AI extraction complete
 * - skipped: Score didn't meet threshold or analysis failed
 * - matched: Successfully matched and saved to job_matches
 */
export type JobListingStatus =
  | "pending"
  | "analyzing"
  | "analyzed"
  | "skipped"
  | "matched"

/**
 * Standard job listing structure returned by scrapers.
 *
 * Python equivalent: Standard job dictionary in job_finder.scrapers.base.BaseScraper
 *
 * Flow:
 * 1. Scraper extracts job data (required + optional fields)
 * 2. CompanyInfoFetcher adds company_info
 * 3. AI analysis adds companyId and resumeIntakeData
 */
export interface JobListing {
  // ============================================
  // REQUIRED FIELDS (scrapers must populate)
  // ============================================

  /** Job title/role */
  title: string

  /** Company name */
  company: string

  /** Company website URL */
  companyWebsite: string

  /** Job location (city, state, remote, hybrid, etc.) */
  location: string

  /** Full job description HTML or text */
  description: string

  /** Job posting URL (unique identifier) */
  url: string

  // ============================================
  // OPTIONAL FIELDS (may be null if not on page)
  // ============================================

  /**
   * Job posting date
   * null = not found on job page (NOT "unknown" or empty string)
   */
  postedDate?: string | null

  /**
   * Salary range or compensation info
   * null = not listed in job posting (NOT "unknown" or empty string)
   */
  salary?: string | null

  // ============================================
  // ADDED DURING PROCESSING (not from scraper)
  // ============================================

  /**
   * Company about/culture/mission information
   * Fetched via CompanyInfoFetcher after scraping
   */
  companyInfo?: string

  /**
  * Company record ID
   * Added during JOB_ANALYZE step
   */
  companyId?: string

  /**
   * AI-generated resume customization data
   * Added during JOB_ANALYZE step
   * Contains all resume tailoring guidance including ATS keywords
   */
  resumeIntakeData?: ResumeIntakeData
}

/**
 * Persisted job listing record (job_listings table).
 *
 * This is the source of truth for:
 * - Job deduplication (URL uniqueness)
 * - Tracking all jobs that pass pre-filter
 * - Linking jobs to sources and companies
 *
 * Unlike JobListing (scraper DTO), this represents a persisted database record.
 */
export interface JobListingRecord {
  /** Database record ID */
  id: string

  /** Job posting URL (unique identifier) */
  url: string

  /** Source ID that discovered this job */
  sourceId?: string | null

  /** Company record ID */
  companyId?: string | null

  /** Job title/role */
  title: string

  /** Company name (as scraped) */
  companyName: string

  /** Job location */
  location?: string | null

  /** Salary range or compensation info */
  salaryRange?: string | null

  /** Full job description */
  description: string

  /** When the job was posted */
  postedDate?: string | null

  /** Pipeline status */
  status: JobListingStatus

  /** Filter/extraction result details */
  filterResult?: Record<string, unknown> | null

  /** Full analysis result with score breakdown, matched/missing skills, and reasons */
  analysisResult?: JobAnalysisResult | null

  /** AI match score (0-100), extracted from analysisResult for quick filtering */
  matchScore?: number | null

  /** When record was created */
  createdAt: TimestampLike

  /** When record was last updated */
  updatedAt: TimestampLike
}

/**
 * Experience highlight for resume customization
 */
export interface ExperienceHighlight {
  /** Company name from work history */
  company: string

  /** Job title from work history */
  title: string

  /** Specific bullet points or achievements to emphasize */
  pointsToEmphasize: string[]
}

/**
 * Project recommendation for resume
 */
export interface ProjectRecommendation {
  /** Project name */
  name: string

  /** Why this project is relevant to the job */
  whyRelevant: string

  /** Specific points or features to highlight */
  pointsToHighlight: string[]
}

/**
 * Strategy for addressing missing skills
 */
export interface GapMitigation {
  /** The missing skill or requirement */
  missingSkill: string

  /** How to address the gap using existing skills */
  mitigationStrategy: string

  /** Suggested talking point for cover letter */
  coverLetterPoint: string
}

/**
 * AI-generated resume customization data.
 *
 * Generated during JOB_ANALYZE pipeline step using expensive AI model (Claude Sonnet).
 * Contains detailed guidance for tailoring resume to specific job.
 *
 * Python equivalent: resume_intake_data dict in job_finder.ai.matcher.JobMatchResult
 *
 * IMPORTANT: This is the SINGLE SOURCE OF TRUTH for ATS keywords.
 * There is NO job-level "keywords" field anymore (removed in data cleanup).
 */
export interface ResumeIntakeData {
  /** Job posting URL (reference) */
  jobId: string

  /** Job title (reference) */
  jobTitle: string

  /** Company name (reference) */
  company: string

  /**
   * Tailored professional summary (2-3 sentences)
   * Emphasizes skills/experience most relevant to role
   */
  targetSummary: string

  /**
   * Priority-ordered list of skills to include
   * Title-mentioned skills first, grouped by relevance
   */
  skillsPriority: string[]

  /**
   * Work experience entries to emphasize and how
   */
  experienceHighlights: ExperienceHighlight[]

  /**
   * 2-3 most relevant projects to include
   */
  projectsToInclude: ProjectRecommendation[]

  /**
   * How to frame/reword achievements for this job
   */
  achievementAngles: string[]

  /**
   * ATS optimization keywords (10-15 critical terms)
   * Includes exact technology names (case-sensitive)
   * Includes role-specific and domain-specific terminology
   *
   * NOTE: This is the ONLY place ATS keywords are stored.
   * Scrapers do NOT populate keywords anymore.
   */
  atsKeywords: string[]

  /**
   * Strategies for addressing missing skills (if any)
   */
  gapMitigation?: GapMitigation[]
}

/**
 * AI job match analysis result (saved to job_matches table).
 *
 * Python equivalent: JobMatchResult in job_finder.ai.matcher
 *
 * Written by job-finder during JOB_SAVE pipeline step.
 * Read by portfolio for displaying matched jobs.
 *
 * NOTE: Job listing data (url, title, company, etc.) lives in job_listings table.
 * This table stores only the AI analysis results with a FK to the listing.
 */
export interface JobMatch {
  /** Database record ID */
  id?: string

  /** Foreign key to job_listings table */
  jobListingId: string

  /** AI match score (0-100) */
  matchScore: number

  /** Skills that match job requirements */
  matchedSkills: string[]

  /** Skills/requirements missing from profile */
  missingSkills: string[]

  /** Why this role fits well */
  matchReasons: string[]

  /** Key strengths for this application */
  keyStrengths: string[]

  /** Potential concerns or gaps */
  potentialConcerns: string[]

  /** How well experience level matches (0-100) */
  experienceMatch: number

  /** Specific recommendations for customizing application */
  customizationRecommendations: string[]

  /**
   * Resume customization data (CONTAINS atsKeywords)
   * This is the single source of truth for ATS keywords
   */
  resumeIntakeData?: ResumeIntakeData

  /** When AI analysis was performed */
  analyzedAt: TimestampLike

  /** When record was created */
  createdAt: TimestampLike

  /** User ID who submitted the job */
  submittedBy: string | null

  /** Queue item ID that generated this match */
  queueItemId: string
}

/**
 * Job match with full listing data (for API responses).
 *
 * This combines the analysis results with the job listing data,
 * avoiding the need for multiple queries on the frontend.
 */
export interface JobMatchWithListing extends JobMatch {
  /** The job listing this match is for */
  listing: JobListingRecord

  /** Company record (if available) */
  company?: Company | null
}

/**
 * Company record (companies collection).
 *
 * Managed by job-finder, read by portfolio.
 */
export interface Company {
  /** Database record ID */
  id?: string

  /** Company name */
  name: string

  /** Company website URL */
  website: string

  /** About/mission statement */
  about?: string | null

  /** Company culture description */
  culture?: string | null

  /** Mission statement */
  mission?: string | null

  /** Industry/sector */
  industry?: string | null

  /** Company headquarters location */
  headquartersLocation?: string | null

  /** Company size category (large/medium/small) */
  companySizeCategory?: "large" | "medium" | "small" | null

  /** Detected technology stack */
  techStack?: string[]

  /** When company was added */
  createdAt?: TimestampLike

  /** When company record was last updated */
  updatedAt?: TimestampLike
}

/**
 * Job source status for scrapers/APIs.
 */
export type JobSourceStatus = "active" | "paused" | "disabled" | "error"

/**
 * Source configuration JSON structure.
 *
 * This defines the structure of the configJson field in JobSource.
 * Maps to Python's SourceConfig dataclass in job_finder/scrapers/source_config.py.
 */
export interface SourceConfigJson {
  /** Source type - "api" | "rss" | "html" */
  type: "api" | "rss" | "html"
  /** Endpoint URL, RSS feed URL, or page URL */
  url: string
  /** Mapping of job fields to extraction paths */
  fields: Record<string, string>
  /** Path to jobs array in API response (e.g., "jobs", "data.results") */
  response_path?: string
  /** CSS selector for job items in HTML */
  job_selector?: string
  /** Override company name for all jobs from this source */
  company_name?: string
  /** Custom HTTP headers for requests */
  headers?: Record<string, string>
  /** API key for authenticated sources */
  api_key?: string
  /** Authentication type - "header" | "query" | "bearer" */
  auth_type?: "header" | "query" | "bearer"
  /** Header name or query param name for auth */
  auth_param?: string
  /** Path to minimum salary field in response */
  salary_min_field?: string
  /** Path to maximum salary field in response */
  salary_max_field?: string
  /** HTTP method - "GET" | "POST" */
  method?: "GET" | "POST"
  /** POST body for APIs that require it (e.g., Workday) */
  post_body?: Record<string, unknown>
  /** Base URL for constructing full URLs from relative paths */
  base_url?: string
  /** Validation policy - "fail_on_empty" | "allow_empty" */
  validation_policy?: "fail_on_empty" | "allow_empty"
  /** Notes explaining why source is disabled */
  disabled_notes?: string
  /** Company extraction strategy - "from_title" | "from_description" */
  company_extraction?: "from_title" | "from_description"
  /** Whether to fetch each job's detail page to enrich fields */
  follow_detail?: boolean
  /**
   * Remote source flag - if true, all jobs from this source are assumed remote.
   * Use for remote-only job boards like RemoteOK, WeWorkRemotely, Remotive, etc.
   */
  is_remote_source?: boolean
}

/**
 * Job source record (job_sources table).
 *
 * Represents a configured source for scraping job listings.
 * Can be an API endpoint, RSS feed, or HTML scraper configuration.
 */
export interface JobSource {
  /** Database record ID */
  id?: string

  /** Human-readable source name */
  name: string

  /** Source type - generic scraping method: "api" | "rss" | "html" (vendor auto-detected from config) */
  sourceType: string

  /** Source status */
  status: JobSourceStatus

  /** Configuration blob (see SourceConfigJson for structure) */
  configJson: SourceConfigJson

  /** Tags for categorization */
  tags?: string[] | null

  /** Associated company ID (for company-specific sources) */
  companyId?: string | null

  /** Aggregator domain (for job board platforms like greenhouse.io, remotive.com) */
  aggregatorDomain?: string | null

  /** When source was last scraped */
  lastScrapedAt?: TimestampLike | null

  /** When source was created */
  createdAt?: TimestampLike

  /** When source was last updated */
  updatedAt?: TimestampLike
}
