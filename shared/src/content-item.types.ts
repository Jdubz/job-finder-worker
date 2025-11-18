/**
 * Content Item Types
 *
 * Unified content management system for resume content.
 * Replaces the deprecated blurbs system.
 *
 * Used by both job-finder-BE (Cloud Functions) and job-finder-FE.
 */

import type { TimestampLike } from "./firestore.types"

/**
 * Content item type discriminator
 */
export type ContentItemType =
  | "company"
  | "project"
  | "skill-group"
  | "education"
  | "profile-section"
  | "accomplishment"

/**
 * Visibility status for content items
 */
export type ContentItemVisibility = "published" | "draft" | "archived"

/**
 * AI context hints for generator
 */
export interface AIContext {
  emphasize?: boolean
  omitFromResume?: boolean
  keywords?: string[]
}

/**
 * Base interface for all content items
 */
export interface BaseContentItem {
  id: string
  type: ContentItemType
  userId: string
  parentId: string | null
  order: number
  createdAt: TimestampLike
  updatedAt: TimestampLike
  createdBy: string
  updatedBy: string
  visibility?: ContentItemVisibility
  tags?: string[]
  aiContext?: AIContext
}

/**
 * Company/Employer Item
 * Traditional employment history entry
 */
export interface CompanyItem extends BaseContentItem {
  type: "company"
  company: string
  role?: string
  location?: string
  website?: string
  startDate: string // YYYY-MM format
  endDate?: string | null // YYYY-MM format or null for current
  summary?: string
  accomplishments?: string[]
  technologies?: string[]
  notes?: string
}

/**
 * Project Item
 * Can be standalone or nested under a company
 */
export interface ProjectItem extends BaseContentItem {
  type: "project"
  name: string
  role?: string
  startDate?: string // YYYY-MM format
  endDate?: string | null // YYYY-MM format or null for current
  description: string
  accomplishments?: string[]
  technologies?: string[]
  challenges?: string[]
  links?: Array<{
    label: string
    url: string
  }>
  context?: string
}

/**
 * Skill Group Item
 * Categorized list of skills
 */
export interface SkillGroupItem extends BaseContentItem {
  type: "skill-group"
  category: string
  skills: string[]
  proficiency?: {
    [skill: string]: "beginner" | "intermediate" | "advanced" | "expert"
  }
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
  institution: string
  degree?: string
  field?: string
  location?: string
  startDate?: string // YYYY-MM format
  endDate?: string | null // YYYY-MM format or null for current
  honors?: string
  description?: string
  relevantCourses?: string[]
  credentialId?: string
  credentialUrl?: string
  expiresAt?: string
}

/**
 * Profile Section Item
 * Intro/about section with optional structured data
 */
export interface ProfileSectionItem extends BaseContentItem {
  type: "profile-section"
  heading: string
  content: string
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
 * Accomplishment Item
 * Granular achievement tracking
 */
export interface AccomplishmentItem extends BaseContentItem {
  type: "accomplishment"
  description: string
  context?: string
  impact?: string
  technologies?: string[]
  date?: string // YYYY-MM format
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
  | AccomplishmentItem

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
export type CreateAccomplishmentData = Omit<
  AccomplishmentItem,
  "id" | "createdAt" | "updatedAt" | "createdBy" | "updatedBy"
>

export type CreateContentItemData =
  | CreateCompanyData
  | CreateProjectData
  | CreateSkillGroupData
  | CreateEducationData
  | CreateProfileSectionData
  | CreateAccomplishmentData

/**
 * Update data types (all fields optional except updatedBy)
 */
export type UpdateCompanyData = Partial<
  Omit<CompanyItem, "id" | "type" | "userId" | "createdAt" | "updatedAt" | "createdBy" | "updatedBy">
>
export type UpdateProjectData = Partial<
  Omit<ProjectItem, "id" | "type" | "userId" | "createdAt" | "updatedAt" | "createdBy" | "updatedBy">
>
export type UpdateSkillGroupData = Partial<
  Omit<SkillGroupItem, "id" | "type" | "userId" | "createdAt" | "updatedAt" | "createdBy" | "updatedBy">
>
export type UpdateEducationData = Partial<
  Omit<EducationItem, "id" | "type" | "userId" | "createdAt" | "updatedAt" | "createdBy" | "updatedBy">
>
export type UpdateProfileSectionData = Partial<
  Omit<ProfileSectionItem, "id" | "type" | "userId" | "createdAt" | "updatedAt" | "createdBy" | "updatedBy">
>
export type UpdateAccomplishmentData = Partial<
  Omit<AccomplishmentItem, "id" | "type" | "userId" | "createdAt" | "updatedAt" | "createdBy" | "updatedBy">
>

export type UpdateContentItemData =
  | UpdateCompanyData
  | UpdateProjectData
  | UpdateSkillGroupData
  | UpdateEducationData
  | UpdateProfileSectionData
  | UpdateAccomplishmentData

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
  type?: ContentItemType
  parentId?: string | null
  visibility?: ContentItemVisibility
  tags?: string[]
  limit?: number
  offset?: number
}
