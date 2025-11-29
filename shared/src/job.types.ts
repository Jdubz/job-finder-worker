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

/**
 * Status of a job listing in the pipeline.
 */
export type JobListingStatus =
  | "pending"
  | "filtered"
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

  /** Filter result details (if status=filtered) */
  filterResult?: Record<string, unknown> | null

  /** Full analysis result JSON (match scores, reasons, etc.) */
  analysisResult?: Record<string, unknown> | null

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

  /** Application priority level */
  applicationPriority: "High" | "Medium" | "Low"

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

  /** Configuration blob (type-specific) */
  configJson: Record<string, unknown>

  /** Tags for categorization */
  tags?: string[] | null

  /** Associated company ID */
  companyId?: string | null

  /** Associated company name */
  companyName?: string | null

  /** When source was last scraped */
  lastScrapedAt?: TimestampLike | null

  /** When source was created */
  createdAt?: TimestampLike

  /** When source was last updated */
  updatedAt?: TimestampLike
}
