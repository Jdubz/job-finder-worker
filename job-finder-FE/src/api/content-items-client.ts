import { BaseApiClient } from "./base-client"
import { API_CONFIG } from "@/config/api"
import type {
  ContentItem,
  ContentItemNode,
  CreateContentItemData,
  CreateContentItemRequest,
  CreateContentItemResponse,
  DeleteContentItemResponse,
  GetContentItemResponse,
  ListContentItemsRequest,
  ListContentItemsResponse,
  ReorderContentItemRequest,
  ReorderContentItemResponse,
  UpdateContentItemData,
  UpdateContentItemRequest,
  UpdateContentItemResponse
} from "@shared/types"
import type { ApiSuccessResponse } from "@shared/types"

export class ContentItemsClient extends BaseApiClient {
  constructor(baseUrl = API_CONFIG.baseUrl) {
    super(baseUrl)
  }

  async list(
    userId: string,
    params: Partial<Omit<ListContentItemsRequest, "userId">> = {}
  ): Promise<ContentItemNode[]> {
    const search = new URLSearchParams()
    search.append("userId", userId)
    if (params.parentId === null) {
      search.append("parentId", "")
    } else if (params.parentId) {
      search.append("parentId", params.parentId)
    }
    if (params.visibility) search.append("visibility", params.visibility)
    if (params.includeDrafts) search.append("includeDrafts", String(params.includeDrafts))
    if (params.limit) search.append("limit", params.limit.toString())
    if (params.offset) search.append("offset", params.offset.toString())

    const query = search.toString()
    const response = await this.get<ApiSuccessResponse<ListContentItemsResponse>>(
      `/content-items${query ? `?${query}` : ""}`
    )

    return response.data.items
  }

  async getContentItem(id: string): Promise<ContentItem | null> {
    const response = await this.get<ApiSuccessResponse<GetContentItemResponse>>(
      `/content-items/${id}`
    )

    return response.data.item
  }

  async createContentItem(userEmail: string, data: CreateContentItemData): Promise<ContentItem> {
    const payload: CreateContentItemRequest = {
      itemData: data,
      userEmail
    }

    const response = await this.post<ApiSuccessResponse<CreateContentItemResponse>>(
      `/content-items`,
      payload
    )

    return response.data.item
  }

  async updateContentItem(
    id: string,
    userEmail: string,
    data: UpdateContentItemData
  ): Promise<ContentItem> {
    const payload: UpdateContentItemRequest = {
      itemId: id,
      itemData: data,
      userEmail
    }

    const response = await this.patch<ApiSuccessResponse<UpdateContentItemResponse>>(
      `/content-items/${id}`,
      payload
    )

    return response.data.item
  }

  async deleteContentItem(id: string): Promise<void> {
    await this.delete<ApiSuccessResponse<DeleteContentItemResponse>>(`/content-items/${id}`)
  }

  async reorderContentItem(
    id: string,
    userEmail: string,
    parentId: string | null,
    orderIndex: number
  ): Promise<ContentItem> {
    const payload: ReorderContentItemRequest = {
      itemId: id,
      parentId,
      orderIndex,
      userEmail
    }

    const response = await this.post<ApiSuccessResponse<ReorderContentItemResponse>>(
      `/content-items/${id}/reorder`,
      payload
    )

    return response.data.item
  }
}

export const contentItemsClient = new ContentItemsClient()
