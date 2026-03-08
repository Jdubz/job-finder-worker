import type { ResumeVersion, ResumeItem, ResumeItemNode, CreateResumeItemData, UpdateResumeItemData } from '../resume-version.types'

// --- Version endpoints ---

export interface ListResumeVersionsResponse {
  versions: ResumeVersion[]
}

export interface GetResumeVersionResponse {
  version: ResumeVersion
  items: ResumeItemNode[]
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
  userEmail: string
}

export interface CreateResumeItemResponse {
  item: ResumeItem
  message: string
}

export interface UpdateResumeItemRequest {
  itemData: UpdateResumeItemData
  userEmail: string
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
  userEmail: string
}

export interface ReorderResumeItemResponse {
  item: ResumeItem
}
