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
 * AI job match analysis result (saved to job-matches collection).
 *
 * Python equivalent: JobMatchResult in job_finder.ai.matcher
 *
 * Written by job-finder during JOB_SAVE pipeline step.
 * Read by portfolio for displaying matched jobs.
 */
export interface JobMatch {
  /** Database record ID */
  id?: string

  /** Job posting URL (unique identifier) */
  url: string

  /** Company name */
  companyName: string

  /** Company record ID */
  companyId?: string | null

  /** Job title/role */
  jobTitle: string

  /** Location */
  location?: string | null

  /** Salary range */
  salaryRange?: string | null

  /** Full job description */
  jobDescription: string

  /** Company info (about/culture) */
  companyInfo?: string | null

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

  /** Year founded */
  founded?: number | null

  /** Detected technology stack */
  techStack?: string[]

  /** Priority tier (S/A/B/C/D) for scraping rotation */
  tier?: "S" | "A" | "B" | "C" | "D" | null

  /** Priority score (0-200+) */
  priorityScore?: number | null

  /** Analysis status */
  analysisStatus?: "pending" | "in_progress" | "complete" | "failed" | null

  /** When company was added */
  createdAt?: TimestampLike

  /** When company record was last updated */
  updatedAt?: TimestampLike
}
