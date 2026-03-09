import { BaseApiClient } from "./base-client"
import { API_CONFIG } from "@/config/api"
import type {
  ResumeVersion,
  ResumeItem,
  ResumeItemNode,
  CreateResumeItemData,
  CreateResumeItemRequest,
  CreateResumeItemResponse,
  UpdateResumeItemData,
  UpdateResumeItemRequest,
  UpdateResumeItemResponse,
  DeleteResumeItemResponse,
  ListResumeVersionsResponse,
  GetResumeVersionResponse,
  ListResumeItemsResponse,
  ReorderResumeItemRequest,
  ReorderResumeItemResponse,
  PublishResumeVersionResponse
} from "@shared/types"
import type { ApiSuccessResponse } from "@shared/types"

export class ResumeVersionsClient extends BaseApiClient {
  constructor(baseUrl: string | (() => string) = () => API_CONFIG.baseUrl) {
    super(baseUrl)
  }

  async listVersions(): Promise<ResumeVersion[]> {
    const response = await this.get<ApiSuccessResponse<ListResumeVersionsResponse>>(
      "/resume-versions"
    )
    return response.data.versions
  }

  async getVersion(slug: string): Promise<GetResumeVersionResponse> {
    const response = await this.get<ApiSuccessResponse<GetResumeVersionResponse>>(
      `/resume-versions/${slug}`
    )
    return response.data
  }

  async getItems(slug: string): Promise<ResumeItemNode[]> {
    const response = await this.get<ApiSuccessResponse<ListResumeItemsResponse>>(
      `/resume-versions/${slug}/items`
    )
    return response.data.items
  }

  async createItem(
    slug: string,
    data: CreateResumeItemData
  ): Promise<ResumeItem> {
    const payload: CreateResumeItemRequest = { itemData: data }
    const response = await this.post<ApiSuccessResponse<CreateResumeItemResponse>>(
      `/resume-versions/${slug}/items`,
      payload
    )
    return response.data.item
  }

  async updateItem(
    slug: string,
    id: string,
    data: UpdateResumeItemData
  ): Promise<ResumeItem> {
    const payload: UpdateResumeItemRequest = { itemData: data }
    const response = await this.patch<ApiSuccessResponse<UpdateResumeItemResponse>>(
      `/resume-versions/${slug}/items/${id}`,
      payload
    )
    return response.data.item
  }

  async deleteItem(slug: string, id: string): Promise<void> {
    await this.delete<ApiSuccessResponse<DeleteResumeItemResponse>>(
      `/resume-versions/${slug}/items/${id}`
    )
  }

  async reorderItem(
    slug: string,
    id: string,
    parentId: string | null,
    orderIndex: number
  ): Promise<ResumeItem> {
    const payload: ReorderResumeItemRequest = { parentId, orderIndex }
    const response = await this.post<ApiSuccessResponse<ReorderResumeItemResponse>>(
      `/resume-versions/${slug}/items/${id}/reorder`,
      payload
    )
    return response.data.item
  }

  async publish(slug: string): Promise<PublishResumeVersionResponse> {
    const response = await this.post<ApiSuccessResponse<PublishResumeVersionResponse>>(
      `/resume-versions/${slug}/publish`
    )
    return response.data
  }

  getPdfUrl(slug: string): string {
    return `${this.baseUrl}/resume-versions/${slug}/pdf`
  }
}

export const resumeVersionsClient = new ResumeVersionsClient()
