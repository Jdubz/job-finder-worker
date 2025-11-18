/**
 * Content API Types
 *
 * Type definitions for content management API endpoints.
 * Handles CRUD operations for content items (companies, projects, skills, etc.).
 *
 * Used by job-finder-FE for content management pages
 * and by job-finder-BE to implement the endpoints.
 */

import type { ApiResponse, PaginationParams, PaginatedApiResponse } from "../api.types"
import type {
  ContentItem,
  ContentItemType,
  ContentItemVisibility,
  CreateContentItemData,
  UpdateContentItemData,
} from "../content-item.types"

/**
 * Create Content Item Request
 * Request payload for creating a new content item
 */
export interface CreateContentItemRequest {
  itemData: CreateContentItemData
}

/**
 * Create Content Item Response
 * Response payload for successful content item creation
 */
export interface CreateContentItemResponse {
  item: ContentItem
  message?: string
}

/**
 * Update Content Item Request
 * Request payload for updating an existing content item
 */
export interface UpdateContentItemRequest {
  itemId: string
  itemData: UpdateContentItemData
}

/**
 * Update Content Item Response
 * Response payload for successful content item update
 */
export interface UpdateContentItemResponse {
  item: ContentItem
  message?: string
}

/**
 * Delete Content Item Request
 * Request payload for deleting a content item
 */
export interface DeleteContentItemRequest {
  itemId: string
  permanent?: boolean // Soft delete by default, permanent if true
}

/**
 * Delete Content Item Response
 * Response payload for successful content item deletion
 */
export interface DeleteContentItemResponse {
  itemId: string
  deleted: boolean
  permanent: boolean
  message?: string
}

/**
 * Get Content Item Request
 * Request payload for fetching a single content item
 */
export interface GetContentItemRequest {
  itemId: string
}

/**
 * Get Content Item Response
 * Response payload for successful content item fetch
 */
export interface GetContentItemResponse {
  item: ContentItem
}

/**
 * List Content Items Request
 * Request payload for listing content items with filters
 */
export interface ListContentItemsRequest extends PaginationParams {
  type?: ContentItemType
  parentId?: string | null
  visibility?: ContentItemVisibility
  tags?: string[]
  search?: string
  sortBy?: "order" | "createdAt" | "updatedAt"
  sortOrder?: "asc" | "desc"
}

/**
 * List Content Items Response
 * Response payload for successful content items list
 */
export interface ListContentItemsResponse {
  items: ContentItem[]
  pagination: {
    limit: number
    offset: number
    total: number
    hasMore: boolean
  }
}

/**
 * Reorder Content Items Request
 * Request payload for reordering content items
 */
export interface ReorderContentItemsRequest {
  items: Array<{
    itemId: string
    order: number
  }>
}

/**
 * Reorder Content Items Response
 * Response payload for successful content items reorder
 */
export interface ReorderContentItemsResponse {
  updatedCount: number
  items: ContentItem[]
  message?: string
}

/**
 * Bulk Delete Content Items Request
 * Request payload for deleting multiple content items
 */
export interface BulkDeleteContentItemsRequest {
  itemIds: string[]
  permanent?: boolean
}

/**
 * Bulk Delete Content Items Response
 * Response payload for successful bulk deletion
 */
export interface BulkDeleteContentItemsResponse {
  deletedCount: number
  failedIds?: string[]
  message?: string
}

/**
 * Archive Content Item Request
 * Request payload for archiving a content item
 */
export interface ArchiveContentItemRequest {
  itemId: string
}

/**
 * Archive Content Item Response
 * Response payload for successful content item archival
 */
export interface ArchiveContentItemResponse {
  item: ContentItem
  message?: string
}

/**
 * Publish Content Item Request
 * Request payload for publishing a draft content item
 */
export interface PublishContentItemRequest {
  itemId: string
}

/**
 * Publish Content Item Response
 * Response payload for successful content item publication
 */
export interface PublishContentItemResponse {
  item: ContentItem
  message?: string
}

/**
 * Type-safe API signatures for content endpoints
 */
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

export type ReorderContentItemsApi = (
  request: ReorderContentItemsRequest
) => Promise<ApiResponse<ReorderContentItemsResponse>>

export type BulkDeleteContentItemsApi = (
  request: BulkDeleteContentItemsRequest
) => Promise<ApiResponse<BulkDeleteContentItemsResponse>>

export type ArchiveContentItemApi = (
  request: ArchiveContentItemRequest
) => Promise<ApiResponse<ArchiveContentItemResponse>>

export type PublishContentItemApi = (
  request: PublishContentItemRequest
) => Promise<ApiResponse<PublishContentItemResponse>>
