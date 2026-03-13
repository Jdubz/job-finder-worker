import type { ContentItemAIContext } from './content-item.types'
import type { ResumeContent } from './generator.types'
import type { ContentFitEstimate } from './api/resume-version.types'
import type { TimestampJson } from './schemas/timestamp.schema'

export type ResumeVersionSlug = string

export interface ResumeVersion {
  id: string
  slug: ResumeVersionSlug
  name: string
  description: string | null
  pdfPath: string | null
  pdfSizeBytes: number | null
  publishedAt: TimestampJson | null
  publishedBy: string | null
  createdAt: TimestampJson
  updatedAt: TimestampJson
}

export interface ResumeItem {
  id: string
  resumeVersionId: string
  parentId: string | null
  orderIndex: number
  aiContext: ContentItemAIContext | null
  title: string | null
  role: string | null
  location: string | null
  website: string | null
  startDate: string | null
  endDate: string | null
  description: string | null
  skills: string[] | null
  createdAt: TimestampJson
  updatedAt: TimestampJson
  createdBy: string
  updatedBy: string
}

export type ResumeItemNode = ResumeItem & {
  children?: ResumeItemNode[]
}

export type CreateResumeItemData = {
  parentId?: string | null
  orderIndex?: number
  aiContext?: ContentItemAIContext | null
  title?: string | null
  role?: string | null
  location?: string | null
  website?: string | null
  startDate?: string | null
  endDate?: string | null
  description?: string | null
  skills?: string[] | null
}

export type UpdateResumeItemData = Partial<CreateResumeItemData>

export interface CreateResumeVersionData {
  name: string
  slug: string
  description?: string | null
}

export interface TailoredResume {
  id: string
  jobMatchId: string
  resumeContent: ResumeContent
  selectedItems: string[] // pool item IDs
  pdfPath: string | null
  pdfSizeBytes: number | null
  contentFit: ContentFitEstimate | null
  reasoning: string | null
  createdAt: TimestampJson
  expiresAt: TimestampJson
}
