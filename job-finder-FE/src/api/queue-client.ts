import { BaseApiClient } from "./base-client"
import { API_CONFIG } from "@/config/api"
import type {
  ListQueueItemsResponse,
  SubmitJobRequest,
  SubmitJobResponse,
  SubmitCompanyRequest,
  SubmitCompanyResponse,
  SubmitScrapeRequest,
  SubmitScrapeResponse,
  GetQueueStatsResponse,
  GetQueueItemResponse,
  UpdateJobStatusResponse,
  QueueItem
} from "@shared/types"
import type { ApiSuccessResponse } from "@shared/types"

export interface ListQueueParams {
  status?: string | string[]
  type?: string
  source?: string
  limit?: number
  offset?: number
}

export class QueueClient extends BaseApiClient {
  constructor(baseUrl = API_CONFIG.baseUrl) {
    super(baseUrl)
  }

  async listQueueItems(params: ListQueueParams = {}): Promise<ListQueueItemsResponse> {
    const search = new URLSearchParams()
    if (params.status) {
      const statuses = Array.isArray(params.status) ? params.status : [params.status]
      statuses.forEach((status) => search.append("status", status))
    }
    if (params.type) search.append("type", params.type)
    if (params.source) search.append("source", params.source)
    if (typeof params.limit === "number") search.append("limit", String(params.limit))
    if (typeof params.offset === "number") search.append("offset", String(params.offset))

    const query = search.toString()
    const response = await this.get<ApiSuccessResponse<ListQueueItemsResponse>>(
      `/queue${query ? `?${query}` : ""}`
    )
    return response.data
  }

  async getQueueItem(id: string): Promise<GetQueueItemResponse["queueItem"]> {
    const response = await this.get<ApiSuccessResponse<GetQueueItemResponse>>(`/queue/${id}`)
    return response.data.queueItem
  }

  async submitJob(request: SubmitJobRequest): Promise<QueueItem> {
    const response = await this.post<ApiSuccessResponse<SubmitJobResponse>>(`/queue/jobs`, request)
    return response.data.queueItem
  }

  async submitCompany(request: SubmitCompanyRequest): Promise<QueueItem> {
    const response = await this.post<ApiSuccessResponse<SubmitCompanyResponse>>(
      `/queue/companies`,
      request
    )
    return response.data.queueItem
  }

  async submitScrape(request: SubmitScrapeRequest): Promise<QueueItem> {
    const response = await this.post<ApiSuccessResponse<SubmitScrapeResponse>>(
      `/queue/scrape`,
      request
    )
    return response.data.queueItem
  }

  async updateQueueItem(
    id: string,
    updates: Partial<QueueItem>
  ): Promise<UpdateJobStatusResponse["queueItem"]> {
    const response = await this.patch<ApiSuccessResponse<UpdateJobStatusResponse>>(
      `/queue/${id}`,
      updates
    )
    return response.data.queueItem
  }

  async deleteQueueItem(id: string): Promise<void> {
    await this.delete(`/queue/${id}`)
  }

  async getStats(): Promise<GetQueueStatsResponse["stats"]> {
    const response = await this.get<ApiSuccessResponse<GetQueueStatsResponse>>(`/queue/stats`)
    return response.data.stats
  }
}

export const queueClient = new QueueClient()
