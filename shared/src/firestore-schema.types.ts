/**
 * Firestore Database Schema Types
 * 
 * Complete TypeScript definitions for all Firestore collections in the portfolio database.
 * Schema extracted from production (portfolio) database on 2025-10-21.
 * 
 * These types represent the actual structure of documents as stored in Firestore,
 * and should be kept in sync with the production database schema.
 * 
 * @package @shared/types
 */

import type { TimestampLike } from './firestore.types'

// ============================================================================
// Queue Collection Types
// ============================================================================

/**
 * QueueItemDocumentStatus - Processing status for queue items in Firestore
 */
export type QueueItemDocumentStatus = 'pending' | 'processing' | 'success' | 'failed' | 'skipped'

/**
 * QueueItemDocumentType - Type of item in the queue collection
 */
export type QueueItemDocumentType = 'job' | 'company'

/**
 * QueueDocumentSource - Origin of the queue item in Firestore
 */
export type QueueDocumentSource = 'user_submission' | 'scraper' | 'api' | 'manual'

/**
 * QueueItemDocument - Document structure for job-queue collection
 * 
 * Represents items in the job processing queue, tracking their status
 * through the scraping and analysis pipeline.
 */
export interface QueueItemDocument {
  /** Item type (job or company) */
  type: QueueItemDocumentType
  
  /** Current processing status */
  status: QueueItemDocumentStatus
  
  /** URL of the job or company page */
  url: string
  
  /** Company name */
  company_name: string
  
  /** Origin of this queue item */
  source: QueueDocumentSource
  
  /** Number of retry attempts made */
  retry_count: number
  
  /** Maximum retries allowed */
  max_retries: number
  
  /** When the item was created */
  created_at: TimestampLike
  
  /** When the item was last updated */
  updated_at: TimestampLike
  
  /** When processing started (optional) */
  processed_at?: TimestampLike
  
  /** When processing completed (optional) */
  completed_at?: TimestampLike
  
  /** Result message after processing (optional) */
  result_message?: string
  
  /** Error details if processing failed (optional) */
  error_details?: string
  
  /** User ID who submitted this item (optional) */
  submitted_by?: string
  
  /** Reference to the company document (optional) */
  company_id?: string
  
  /** Additional metadata (optional) */
  metadata?: Record<string, unknown>
}

// ============================================================================
// Companies Collection Types
// ============================================================================

/**
 * CompanyTier - Priority tier for job scraping
 */
export type CompanyTier = 'S' | 'A' | 'B' | 'C' | 'D' | ''

/**
 * CompanyDocument - Document structure for companies collection
 * 
 * Stores information about companies including their metadata,
 * priority scoring, and technology stack.
 */
export interface CompanyDocument {
  /** Company name */
  name: string
  
  /** Lowercase name for case-insensitive queries */
  name_lower: string
  
  /** Company website URL */
  website: string
  
  /** Company about/description */
  about: string
  
  /** Company culture information */
  culture: string
  
  /** Company mission statement */
  mission: string
  
  /** Company size (currently string, may be empty) */
  size: string
  
  /** Company size category (optional) */
  company_size_category?: string
  
  /** Company founding year/date */
  founded: string
  
  /** Industry classification */
  industry: string
  
  /** Headquarters location */
  headquarters_location: string
  
  /** Whether the company has a Portland office */
  hasPortlandOffice: boolean
  
  /** Technologies used by the company */
  techStack: string[]
  
  /** Priority tier for scraping (S=highest, D=lowest) */
  tier: CompanyTier
  
  /** Calculated priority score */
  priorityScore: number
  
  /** When the document was created */
  createdAt: TimestampLike
  
  /** When the document was last updated */
  updatedAt: TimestampLike
}

// ============================================================================
// Content Items Collection Types
// ============================================================================

/**
 * ContentItemDocumentType - Type of content item in Firestore
 */
export type ContentItemDocumentType = 
  | 'company'
  | 'project'
  | 'skill-group'
  | 'text-section'
  | 'profile-section'
  | 'education'
  | 'accomplishment'

/**
 * ContentItemDocumentVisibility - Visibility status of content item in Firestore
 */
export type ContentItemDocumentVisibility = 'published' | 'draft' | 'archived'

/**
 * BaseContentItemDocument - Common fields for all content items in Firestore
 */
export interface BaseContentItemDocument {
  /** Type of content item */
  type: ContentItemDocumentType
  
  /** Display order */
  order: number
  
  /** Visibility status */
  visibility: ContentItemDocumentVisibility
  
  /** Parent item ID (for hierarchical content) */
  parentId: string | null
  
  /** When the item was created */
  createdAt: TimestampLike
  
  /** When the item was last updated */
  updatedAt: TimestampLike
  
  /** User ID who created this item */
  createdBy: string
  
  /** User ID who last updated this item */
  updatedBy: string
}

/**
 * CompanyContentItemDocument - Company/work experience content item in Firestore
 */
export interface CompanyContentItemDocument extends BaseContentItemDocument {
  type: 'company'
  
  /** Company name */
  company: string
  
  /** Job role/title */
  role: string
  
  /** Work location */
  location: string
  
  /** Start date (YYYY-MM format) */
  startDate: string
  
  /** End date (YYYY-MM format, or 'present') */
  endDate: string
  
  /** Role summary */
  summary?: string
  
  /** Additional notes */
  notes?: string
  
  /** List of accomplishments */
  accomplishments?: string[]
}

/**
 * ProjectContentItemDocument - Project content item in Firestore
 */
export interface ProjectContentItemDocument extends BaseContentItemDocument {
  type: 'project'
  
  /** Project name */
  name: string
  
  /** Project description */
  description: string
  
  /** Technologies used */
  technologies?: string[]
}

/**
 * SkillGroupContentItemDocument - Skill group/category content item in Firestore
 */
export interface SkillGroupContentItemDocument extends BaseContentItemDocument {
  type: 'skill-group'
  
  /** Category name */
  category: string
  
  /** List of skills (may be empty if using subcategories) */
  skills: string[]
  
  /** Subcategories with their own skills */
  subcategories?: Array<{
    name: string
    skills: string[]
  }>
}

/**
 * TextSectionContentItemDocument - Text/markdown content section in Firestore
 */
export interface TextSectionContentItemDocument extends BaseContentItemDocument {
  type: 'text-section'
  
  /** Section heading */
  heading: string
  
  /** Section content (markdown) */
  content: string
  
  /** Content format */
  format: 'markdown' | 'html' | 'plain'
}

/**
 * ProfileSectionContentItemDocument - Profile overview section in Firestore
 */
export interface ProfileSectionContentItemDocument extends BaseContentItemDocument {
  type: 'profile-section'
  
  /** Section heading */
  heading: string
  
  /** Section content (markdown) */
  content: string
  
  /** Content format */
  format: 'markdown' | 'html' | 'plain'
  
  /** Structured data (for rich profile information) */
  structuredData?: {
    role?: string
    summary?: string
    tagline?: string
    primaryStack?: string[]
    links?: Array<{
      label: string
      url: string
      icon?: string
    }>
  }
}

/**
 * ContentItemDocument - Union type for all content items in Firestore
 */
export type ContentItemDocument =
  | CompanyContentItemDocument
  | ProjectContentItemDocument
  | SkillGroupContentItemDocument
  | TextSectionContentItemDocument
  | ProfileSectionContentItemDocument

// ============================================================================
// Contact Submissions Collection Types
// ============================================================================

/**
 * ContactSubmissionMetadata - Metadata for contact form submissions
 */
export interface ContactSubmissionMetadata {
  /** Submission timestamp (ISO string) */
  timestamp: string
  
  /** Client IP address */
  ip: string
  
  /** Client user agent */
  userAgent: string
  
  /** Referrer URL (optional) */
  referrer?: string
}

/**
 * EmailTransactionResult - Result of email sending operation
 */
export interface EmailTransactionResult {
  /** Whether the operation succeeded */
  success: boolean
  
  /** Response from email service */
  response?: {
    messageId: string
    status: string
    accepted: boolean
  }
  
  /** Error message if failed */
  error?: string
}

/**
 * ContactSubmissionTransaction - Transaction record for contact submission
 */
export interface ContactSubmissionTransaction {
  /** Contact email sending result */
  contactEmail?: EmailTransactionResult
  
  /** Auto-reply email sending result */
  autoReply?: EmailTransactionResult
  
  /** List of errors during transaction */
  errors?: string[]
}

/**
 * ContactSubmissionDocument - Document structure for contact-submissions collection
 * 
 * Stores contact form submissions from the website along with email
 * transaction details and telemetry information.
 */
export interface ContactSubmissionDocument {
  /** Submitter's name */
  name: string
  
  /** Submitter's email */
  email: string
  
  /** Message content */
  message: string
  
  /** Submission status */
  status: 'new' | 'read' | 'replied' | 'archived'
  
  /** Request ID for tracing */
  requestId: string
  
  /** OpenTelemetry trace ID */
  traceId: string
  
  /** OpenTelemetry span ID */
  spanId: string
  
  /** Submission metadata (IP, user agent, etc.) */
  metadata: ContactSubmissionMetadata
  
  /** Email transaction details (optional) */
  transaction?: ContactSubmissionTransaction
  
  /** Mailgun response (legacy field, optional) */
  mailgun?: {
    messageId: string
    status: string
    accepted: boolean
  }
  
  /** When the submission was created */
  createdAt: TimestampLike
  
  /** When the submission was last updated */
  updatedAt: TimestampLike
}

// ============================================================================
// Users Collection Types (Placeholder)
// ============================================================================

/**
 * UserDocument - Document structure for users collection
 * 
 * Note: This collection was empty in production at time of schema extraction.
 * This is a placeholder type based on expected Firebase Auth user structure.
 */
export interface UserDocument {
  /** User email */
  email: string
  
  /** Display name (optional) */
  displayName?: string
  
  /** Photo URL (optional) */
  photoURL?: string
  
  /** Whether email is verified */
  emailVerified?: boolean
  
  /** User role/permissions (optional) */
  role?: string
  
  /** When the user was created */
  createdAt: TimestampLike
  
  /** When the user last logged in */
  lastLoginAt?: TimestampLike
  
  /** Additional metadata (optional) */
  metadata?: Record<string, unknown>
}

// ============================================================================
// Config Collection Types (Placeholder)
// ============================================================================

/**
 * ConfigDocument - Base interface for config documents
 * 
 * Note: This collection was empty in production at time of schema extraction.
 * Config documents are typically stored as named documents (e.g., 'stopList', 'aiSettings').
 */
export interface ConfigDocument {
  /** Config document key */
  key: string
  
  /** Config value (flexible structure) */
  value: Record<string, unknown>
  
  /** When the config was created */
  createdAt: TimestampLike
  
  /** When the config was last updated */
  updatedAt: TimestampLike
  
  /** User who last updated this config */
  updatedBy?: string
}

// ============================================================================
// Type Exports
// ============================================================================

/**
 * FirestoreCollectionName - Union type of all collection names
 */
export type FirestoreCollectionName =
  | 'job-queue'
  | 'job-matches'
  | 'companies'
  | 'content-items'
  | 'generator-documents'  // Renamed from "generator" in portfolio app
  | 'job-finder-config'    // App configuration (ai-settings, personal-info, etc)
  | 'blurbs'
  | 'experiences'
  | 'contact-submissions'
  | 'users'

/**
 * FirestoreCollectionMap - Map of collection names to their document types
 */
export interface FirestoreCollectionMap {
  'job-queue': QueueItemDocument
  'companies': CompanyDocument
  'content-items': ContentItemDocument
  'contact-submissions': ContactSubmissionDocument
  'users': UserDocument
  'config': ConfigDocument
  // Note: job-matches, generator-documents, blurbs, experiences types
  // are defined in their respective type files (job.types.ts, generator.types.ts, etc.)
}

