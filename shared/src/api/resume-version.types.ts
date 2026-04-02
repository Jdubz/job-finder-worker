import type { ResumeVersion, ResumeItem, ResumeItemNode, CreateResumeItemData, UpdateResumeItemData, CreateResumeVersionData, ContentFitEstimate } from '../resume-version.types'
import type { TimestampJson } from '../schemas/timestamp.schema'

// Re-export ContentFitEstimate for consumers that import from this module
export type { ContentFitEstimate } from '../resume-version.types'

// --- Version endpoints ---

export interface ListResumeVersionsResponse {
  versions: ResumeVersion[]
}

export interface GetResumeVersionResponse {
  version: ResumeVersion
  items: ResumeItemNode[]
  contentFit: ContentFitEstimate | null
}

export type CreateResumeVersionRequest = CreateResumeVersionData

export interface CreateResumeVersionResponse {
  version: ResumeVersion
  message: string
}

export interface DeleteResumeVersionResponse {
  slug: string
  deleted: boolean
  message: string
}

export interface PublishResumeVersionResponse {
  version: ResumeVersion
  message: string
}

// --- Item endpoints ---

export interface ListResumeItemsResponse {
  items: ResumeItemNode[]
  total: number
}

export interface CreateResumeItemRequest {
  itemData: CreateResumeItemData
}

export interface CreateResumeItemResponse {
  item: ResumeItem
  message: string
}

export interface UpdateResumeItemRequest {
  itemData: UpdateResumeItemData
}

export interface UpdateResumeItemResponse {
  item: ResumeItem
  message: string
}

export interface DeleteResumeItemResponse {
  itemId: string
  deleted: boolean
  message: string
}

export interface ReorderResumeItemRequest {
  parentId?: string | null
  orderIndex: number
}

export interface ReorderResumeItemResponse {
  item: ResumeItem
}

// --- Tailored resume endpoints ---

export interface TailorResumeRequest {
  jobMatchId: string
}

export interface TailorResumeResponse {
  id: string
  jobMatchId: string
  contentFit: ContentFitEstimate | null
  pdfPath: string | null
  reasoning: string | null
  selectedItemIds: string[]
  createdAt: TimestampJson
  cached: boolean
}

export interface PoolHealthSummary {
  narratives: number
  experiences: number
  highlights: number
  skillCategories: number
  projects: number
  education: number
  totalItems: number
}

// --- Custom resume builder endpoints ---

export interface EstimateResumeRequest {
  selectedItemIds: string[]
  jobTitle?: string
}

export interface EstimateResumeResponse {
  contentFit: ContentFitEstimate
  selectedCount: number
}

export interface BuildCustomResumeRequest {
  selectedItemIds: string[]
  jobTitle?: string
}

export interface BuildCustomResumeResponse {
  contentFit: ContentFitEstimate
  pdfSizeBytes: number
}
