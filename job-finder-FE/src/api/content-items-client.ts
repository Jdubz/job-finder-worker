import { BaseApiClient } from "./base-client"
import { API_CONFIG } from "@/config/api"
import type {
  CreateContentItemRequest,
  CreateContentItemResponse,
  UpdateContentItemRequest,
  UpdateContentItemResponse,
  DeleteContentItemResponse,
  GetContentItemResponse,
  ListContentItemsRequest,
  ListContentItemsResponse,
  ContentItem,
  CreateContentItemData
} from "@shared/types"
import type { ApiSuccessResponse } from "@shared/types"

// Type for content item data before userId is added by the client
// This applies Omit to each member of the union
export type CreateContentItemInput = CreateContentItemData extends infer U
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ? U extends any
    ? Omit<U, 'userId'>
    : never
  : never

export class ContentItemsClient extends BaseApiClient {
  constructor(baseUrl = API_CONFIG.baseUrl) {
    super(baseUrl)
  }

  async list(params: Partial<ListContentItemsRequest> = {}): Promise<ContentItem[]> {
    const search = new URLSearchParams()
    if (params.type) search.append("type", params.type)
    if (params.parentId !== undefined) {
      search.append("parentId", params.parentId === null ? "null" : params.parentId)
    }
    if (params.visibility) search.append("visibility", params.visibility)
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

  async createContentItem(
    userId: string,
    userEmail: string,
    data: CreateContentItemInput
  ): Promise<ContentItem> {
    const payload: CreateContentItemRequest = {
      itemData: {
        ...data,
        userId,
      } as CreateContentItemData,
      userEmail,
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
    data: UpdateContentItemRequest["itemData"]
  ): Promise<ContentItem> {
    const payload: UpdateContentItemRequest = {
      itemId: id,
      itemData: data,
      userEmail,
    }

    const response = await this.patch<ApiSuccessResponse<UpdateContentItemResponse>>(
      `/content-items/${id}`,
      payload
    )
    return response.data.item
  }

  async deleteContentItem(id: string): Promise<DeleteContentItemResponse> {
    const response = await this.delete<ApiSuccessResponse<DeleteContentItemResponse>>(
      `/content-items/${id}`
    )
    return response.data
  }
}

export const contentItemsClient = new ContentItemsClient()
