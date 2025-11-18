/**
 * Content Item Types
 * Unified content schema for experience management
 */

/**
 * Content item type discriminator
 */
export type ContentItemType =
  | "company"
  | "project"
  | "skill-group"
  | "education"
  | "profile-section"
  | "text-section"
  | "accomplishment"
  | "timeline-event"

/**
 * Visibility status
 */
export type ContentItemVisibility = "published" | "draft" | "archived"

/**
 * AI context hints
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
  parentId: string | null
  order: number
  createdAt: string // ISO timestamp
  updatedAt: string // ISO timestamp
  createdBy: string
  updatedBy: string
  visibility?: ContentItemVisibility
  tags?: string[]
  aiContext?: AIContext
}

/**
 * Company/Employer Item
 */
export interface CompanyItem extends BaseContentItem {
  type: "company"
  company: string
  role?: string
  location?: string
  website?: string
  startDate: string // YYYY-MM
  endDate?: string | null
  summary?: string
  accomplishments?: string[]
  technologies?: string[]
  notes?: string
  relatedBlurbIds?: string[] // References to text-section items (portfolio migration compatibility)
}

/**
 * Project Item
 */
export interface ProjectItem extends BaseContentItem {
  type: "project"
  name: string
  role?: string
  startDate?: string
  endDate?: string | null
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
 */
export interface EducationItem extends BaseContentItem {
  type: "education"
  institution: string
  degree?: string
  field?: string
  location?: string
  startDate?: string
  endDate?: string | null
  honors?: string
  description?: string
  relevantCourses?: string[]
  credentialId?: string
  credentialUrl?: string
  expiresAt?: string
}

/**
 * Profile Section Item
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
 * Text Section Item
 */
export interface TextSectionItem extends BaseContentItem {
  type: "text-section"
  heading?: string
  content: string
  format?: "markdown" | "plain" | "html"
}

/**
 * Accomplishment Item
 */
export interface AccomplishmentItem extends BaseContentItem {
  type: "accomplishment"
  description: string
  context?: string
  impact?: string
  technologies?: string[]
  date?: string
}

/**
 * Timeline Event Item
 */
export interface TimelineEventItem extends BaseContentItem {
  type: "timeline-event"
  title: string
  date?: string
  dateRange?: string
  description?: string
  details?: string
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
 * Content item with optional children (for hierarchy)
 */
export type ContentItemWithChildren = ContentItem & {
  children?: ContentItemWithChildren[]
}

/**
 * API Response types
 */
export interface ContentItemApiResponse {
  success: boolean
  data?: {
    item?: ContentItem
    items?: ContentItem[]
    hierarchy?: ContentItemWithChildren[]
    count?: number
    deletedCount?: number
  }
  message?: string
  error?: string
  errorCode?: string
  requestId?: string
}

/**
 * Create/Update data types (for forms)
 */
export type CreateCompanyData = Omit<
  CompanyItem,
  "id" | "createdAt" | "updatedAt" | "createdBy" | "updatedBy"
>
export type UpdateCompanyData = Partial<
  Omit<CompanyItem, "id" | "type" | "createdAt" | "updatedAt" | "createdBy" | "updatedBy">
>

export type CreateProjectData = Omit<
  ProjectItem,
  "id" | "createdAt" | "updatedAt" | "createdBy" | "updatedBy"
>
export type UpdateProjectData = Partial<
  Omit<ProjectItem, "id" | "type" | "createdAt" | "updatedAt" | "createdBy" | "updatedBy">
>

export type CreateSkillGroupData = Omit<
  SkillGroupItem,
  "id" | "createdAt" | "updatedAt" | "createdBy" | "updatedBy"
>
export type UpdateSkillGroupData = Partial<
  Omit<SkillGroupItem, "id" | "type" | "createdAt" | "updatedAt" | "createdBy" | "updatedBy">
>

export type CreateEducationData = Omit<
  EducationItem,
  "id" | "createdAt" | "updatedAt" | "createdBy" | "updatedBy"
>
export type UpdateEducationData = Partial<
  Omit<EducationItem, "id" | "type" | "createdAt" | "updatedAt" | "createdBy" | "updatedBy">
>

export type CreateProfileSectionData = Omit<
  ProfileSectionItem,
  "id" | "createdAt" | "updatedAt" | "createdBy" | "updatedBy"
>
export type UpdateProfileSectionData = Partial<
  Omit<ProfileSectionItem, "id" | "type" | "createdAt" | "updatedAt" | "createdBy" | "updatedBy">
>

export type CreateTextSectionData = Omit<
  TextSectionItem,
  "id" | "createdAt" | "updatedAt" | "createdBy" | "updatedBy"
>
export type UpdateTextSectionData = Partial<
  Omit<TextSectionItem, "id" | "type" | "createdAt" | "updatedAt" | "createdBy" | "updatedBy">
>

export type CreateAccomplishmentData = Omit<
  AccomplishmentItem,
  "id" | "createdAt" | "updatedAt" | "createdBy" | "updatedBy"
>
export type UpdateAccomplishmentData = Partial<
  Omit<AccomplishmentItem, "id" | "type" | "createdAt" | "updatedAt" | "createdBy" | "updatedBy">
>

export type CreateTimelineEventData = Omit<
  TimelineEventItem,
  "id" | "createdAt" | "updatedAt" | "createdBy" | "updatedBy"
>
export type UpdateTimelineEventData = Partial<
  Omit<TimelineEventItem, "id" | "type" | "createdAt" | "updatedAt" | "createdBy" | "updatedBy">
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
 * Query filters for content items
 */
export interface ContentItemFilters {
  type?: ContentItemType[]
  parentId?: string | null
  visibility?: ContentItemVisibility[]
  tags?: string[]
  search?: string
  limit?: number
  offset?: number
}
