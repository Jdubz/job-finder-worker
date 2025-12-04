import type { ApiResponse, PaginationParams } from '../api.types'
import type { ContentItem, ContentItemNode, CreateContentItemData, UpdateContentItemData } from '../content-item.types'

export interface CreateContentItemRequest {
  itemData: CreateContentItemData
  userEmail: string
}

export interface CreateContentItemResponse {
  item: ContentItem
  message: string
}

export interface UpdateContentItemRequest {
  itemId: string
  itemData: UpdateContentItemData
  userEmail: string
}

export interface UpdateContentItemResponse {
  item: ContentItem
  message: string
}

export interface DeleteContentItemRequest {
  itemId: string
}

export interface DeleteContentItemResponse {
  itemId: string
  deleted: boolean
  message?: string
}

export interface GetContentItemRequest {
  itemId: string
}

export interface GetContentItemResponse {
  item: ContentItem | null
}

export interface ListContentItemsRequest extends PaginationParams {
  parentId?: string | null
}

export interface ListContentItemsResponse {
  items: ContentItemNode[]
  total: number
  hasMore: boolean
}

export interface ReorderContentItemRequest {
  itemId: string
  parentId?: string | null
  orderIndex: number
  userEmail: string
}

export interface ReorderContentItemResponse {
  item: ContentItem
}

export type CreateContentItemApi = (
  request: CreateContentItemRequest
) => Promise<ApiResponse<CreateContentItemResponse>>

export type UpdateContentItemApi = (
  request: UpdateContentItemRequest
) => Promise<ApiResponse<UpdateContentItemResponse>>

export type DeleteContentItemApi = (
  request: DeleteContentItemRequest
) => Promise<ApiResponse<DeleteContentItemResponse>>

export type GetContentItemApi = (
  request: GetContentItemRequest
) => Promise<ApiResponse<GetContentItemResponse>>

export type ListContentItemsApi = (
  request: ListContentItemsRequest
) => Promise<ApiResponse<ListContentItemsResponse>>

export type ReorderContentItemApi = (
  request: ReorderContentItemRequest
) => Promise<ApiResponse<ReorderContentItemResponse>>
