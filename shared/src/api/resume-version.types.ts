import type { ResumeVersion, ResumeItem, ResumeItemNode, CreateResumeItemData, UpdateResumeItemData, CreateResumeVersionData } from '../resume-version.types'

// --- Content fit estimation ---

export interface ContentFitEstimate {
  mainColumnLines: number
  maxLines: number
  usagePercent: number    // 0–100+
  pageCount: number       // 1 if fits, 2+ if overflow
  fits: boolean
  overflow: number        // negative = room to spare, positive = overflow lines
  suggestions: string[]
}

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
