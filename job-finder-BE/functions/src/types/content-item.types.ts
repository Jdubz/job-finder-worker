/**
 * Unified Content Item Types
 * Replaces both experiences and blurbs collections
 */

import type { Timestamp } from "@google-cloud/firestore"

/**
 * Content item type discriminator
 */
export type ContentItemType =
  | "company" // Company/employer experience
  | "project" // Standalone or nested project
  | "skill-group" // Categorized skills list
  | "education" // Education or certification entry
  | "profile-section" // Profile header / intro section
  | "text-section" // Freeform markdown section
  | "accomplishment" // Single achievement/bullet point
  | "timeline-event" // Generic timeline entry

/**
 * Visibility status for content items
 */
export type ContentItemVisibility = "published" | "draft" | "archived"

/**
 * AI context hints for generator
 */
export interface AIContext {
  emphasize?: boolean // Prioritize in AI generation
  omitFromResume?: boolean // Exclude from certain outputs
  keywords?: string[] // SEO/ATS keywords
}

/**
 * Base interface for all content items
 */
export interface BaseContentItem {
  id: string
  type: ContentItemType

  // Hierarchy & Ordering
  parentId: string | null // Reference to parent item (enables nesting)
  order: number // Sort order within parent/root level

  // Metadata (common to all types)
  createdAt: Timestamp
  updatedAt: Timestamp
  createdBy: string // Email
  updatedBy: string // Email

  // Visibility & Status
  visibility?: ContentItemVisibility
  tags?: string[]

  // AI Context (helps AI generator understand importance)
  aiContext?: AIContext
}

/**
 * Company/Employer Item
 * Traditional employment history entry
 */
export interface CompanyItem extends BaseContentItem {
  type: "company"

  // Company metadata
  company: string // Company name
  role?: string // Job title
  location?: string // City, State/Country
  website?: string // Company URL

  // Date range
  startDate: string // YYYY-MM format
  endDate?: string | null // YYYY-MM or null (= Present)

  // Content
  summary?: string // Role summary/elevator pitch
  accomplishments?: string[] // Key achievements (bullet points)
  technologies?: string[] // Tech stack used

  // Notes (not shown to users, internal only)
  notes?: string
}

/**
 * Project Item
 * Can be standalone or nested under a company
 */
export interface ProjectItem extends BaseContentItem {
  type: "project"

  // Project metadata
  name: string // Project name
  role?: string // Your role (if applicable)

  // Date range (optional for projects)
  startDate?: string // YYYY-MM format
  endDate?: string | null // YYYY-MM or null

  // Content
  description: string // What the project does
  accomplishments?: string[] // What you achieved/built
  technologies?: string[] // Tech stack
  challenges?: string[] // Problems solved (optional)

  // Links
  links?: Array<{
    label: string // "GitHub", "Live Demo", "Case Study"
    url: string
  }>

  // Context
  context?: string // "Personal project", "Client work", "Open source"
}

/**
 * Skill Group Item
 * Categorized list of skills
 */
export interface SkillGroupItem extends BaseContentItem {
  type: "skill-group"

  // Skill group metadata
  category: string // "Languages", "Frameworks", "Tools", "Soft Skills"

  // Skills list
  skills: string[] // ["React", "TypeScript", "Node.js"]

  // Optional proficiency levels
  proficiency?: {
    [skill: string]: "beginner" | "intermediate" | "advanced" | "expert"
  }

  // Optional grouping
  subcategories?: Array<{
    name: string
    skills: string[]
  }>
}

/**
 * Education Item
 * Formal education or certifications
 */
export interface EducationItem extends BaseContentItem {
  type: "education"

  // Institution metadata
  institution: string // School/organization name
  degree?: string // "B.S. Computer Science", "AWS Certified"
  field?: string // Major/specialization
  location?: string // City, State

  // Date range
  startDate?: string // YYYY-MM format
  endDate?: string | null // YYYY-MM or null (= In Progress)

  // Additional details
  honors?: string // "Magna Cum Laude", "GPA: 3.9"
  description?: string // Details about the program
  relevantCourses?: string[] // Key courses (optional)

  // Certificate-specific
  credentialId?: string // Certificate ID
  credentialUrl?: string // Verification URL
  expiresAt?: string // Expiration date (if applicable)
}

/**
 * Profile Section Item
 * Intro/about section with optional structured data
 */
export interface ProfileSectionItem extends BaseContentItem {
  type: "profile-section"

  // Section metadata
  heading: string // "About", "Summary", "Introduction"

  // Content
  content: string // Markdown or plain text

  // Profile-specific structured data (optional)
  structuredData?: {
    name?: string
    tagline?: string
    role?: string
    summary?: string
    primaryStack?: string[]
    links?: Array<{
      label: string
      url: string
    }>
  }
}

/**
 * Text Section Item
 * Freeform markdown content
 */
export interface TextSectionItem extends BaseContentItem {
  type: "text-section"

  // Section metadata
  heading?: string // Optional heading

  // Content
  content: string // Markdown or plain text

  // Format hints
  format?: "markdown" | "plain" | "html"
}

/**
 * Accomplishment Item
 * Granular achievement tracking
 */
export interface AccomplishmentItem extends BaseContentItem {
  type: "accomplishment"

  // Accomplishment content
  description: string // The achievement

  // Context (optional)
  context?: string // When/where it happened
  impact?: string // Business impact, metrics
  technologies?: string[] // Tech used to achieve it

  // Date (optional)
  date?: string // YYYY-MM format
}

/**
 * Timeline Event Item
 * Generic timeline entry
 */
export interface TimelineEventItem extends BaseContentItem {
  type: "timeline-event"

  // Event metadata
  title: string // Event name

  // Date
  date?: string // YYYY-MM format
  dateRange?: string // "Jan 2020 - Dec 2020" (flexible)

  // Content
  description?: string // What happened
  details?: string // Additional context

  // Links (optional)
  links?: Array<{
    label: string
    url: string
  }>
}

/**
 * Union type for all content items
 */
export type ContentItem =
  | CompanyItem
  | ProjectItem
  | SkillGroupItem
  | EducationItem
  | ProfileSectionItem
  | TextSectionItem
  | AccomplishmentItem
  | TimelineEventItem

/**
 * Create data types (omit id and timestamp fields)
 */
export type CreateCompanyData = Omit<
  CompanyItem,
  "id" | "createdAt" | "updatedAt" | "createdBy" | "updatedBy"
>
export type CreateProjectData = Omit<
  ProjectItem,
  "id" | "createdAt" | "updatedAt" | "createdBy" | "updatedBy"
>
export type CreateSkillGroupData = Omit<
  SkillGroupItem,
  "id" | "createdAt" | "updatedAt" | "createdBy" | "updatedBy"
>
export type CreateEducationData = Omit<
  EducationItem,
  "id" | "createdAt" | "updatedAt" | "createdBy" | "updatedBy"
>
export type CreateProfileSectionData = Omit<
  ProfileSectionItem,
  "id" | "createdAt" | "updatedAt" | "createdBy" | "updatedBy"
>
export type CreateTextSectionData = Omit<
  TextSectionItem,
  "id" | "createdAt" | "updatedAt" | "createdBy" | "updatedBy"
>
export type CreateAccomplishmentData = Omit<
  AccomplishmentItem,
  "id" | "createdAt" | "updatedAt" | "createdBy" | "updatedBy"
>
export type CreateTimelineEventData = Omit<
  TimelineEventItem,
  "id" | "createdAt" | "updatedAt" | "createdBy" | "updatedBy"
>

export type CreateContentItemData =
  | CreateCompanyData
  | CreateProjectData
  | CreateSkillGroupData
  | CreateEducationData
  | CreateProfileSectionData
  | CreateTextSectionData
  | CreateAccomplishmentData
  | CreateTimelineEventData

/**
 * Update data types (all fields optional except updatedBy)
 */
export type UpdateCompanyData = Partial<
  Omit<CompanyItem, "id" | "type" | "createdAt" | "updatedAt" | "createdBy" | "updatedBy">
>
export type UpdateProjectData = Partial<
  Omit<ProjectItem, "id" | "type" | "createdAt" | "updatedAt" | "createdBy" | "updatedBy">
>
export type UpdateSkillGroupData = Partial<
  Omit<SkillGroupItem, "id" | "type" | "createdAt" | "updatedAt" | "createdBy" | "updatedBy">
>
export type UpdateEducationData = Partial<
  Omit<EducationItem, "id" | "type" | "createdAt" | "updatedAt" | "createdBy" | "updatedBy">
>
export type UpdateProfileSectionData = Partial<
  Omit<ProfileSectionItem, "id" | "type" | "createdAt" | "updatedAt" | "createdBy" | "updatedBy">
>
export type UpdateTextSectionData = Partial<
  Omit<TextSectionItem, "id" | "type" | "createdAt" | "updatedAt" | "createdBy" | "updatedBy">
>
export type UpdateAccomplishmentData = Partial<
  Omit<AccomplishmentItem, "id" | "type" | "createdAt" | "updatedAt" | "createdBy" | "updatedBy">
>
export type UpdateTimelineEventData = Partial<
  Omit<TimelineEventItem, "id" | "type" | "createdAt" | "updatedAt" | "createdBy" | "updatedBy">
>

export type UpdateContentItemData =
  | UpdateCompanyData
  | UpdateProjectData
  | UpdateSkillGroupData
  | UpdateEducationData
  | UpdateProfileSectionData
  | UpdateTextSectionData
  | UpdateAccomplishmentData
  | UpdateTimelineEventData

/**
 * API Response types
 */
export interface ContentItemApiResponse {
  success: boolean
  item?: ContentItem
  items?: ContentItem[]
  count?: number
  message?: string
  error?: string
  errorCode?: string
}

/**
 * Query options for listing content items
 */
export interface ListContentItemsOptions {
  type?: ContentItemType // Filter by type
  parentId?: string | null // Filter by parent (null = root items only)
  visibility?: ContentItemVisibility // Filter by visibility
  tags?: string[] // Filter by tags (any match)
  limit?: number // Max results
  offset?: number // Pagination offset
}
