import { BaseApiClient } from "./base-client"
import { API_CONFIG } from "@/config/api"
import type {
  JobSource,
  ListJobSourcesRequest,
  ListJobSourcesResponse,
  GetJobSourceResponse,
  UpdateJobSourceRequest,
  UpdateJobSourceResponse,
  DeleteJobSourceResponse,
  GetJobSourceStatsResponse,
  JobSourceStats
} from "@shared/types"
import type { ApiSuccessResponse } from "@shared/types"

export type ListJobSourcesParams = Omit<ListJobSourcesRequest, "limit" | "offset"> & {
  limit?: number
  offset?: number
}

export class JobSourcesClient extends BaseApiClient {
  constructor(baseUrl: string | (() => string) = () => API_CONFIG.baseUrl) {
    super(baseUrl)
  }

  async listJobSources(params: ListJobSourcesParams = {}): Promise<ListJobSourcesResponse> {
    const search = new URLSearchParams()

    if (params.status) search.append("status", params.status)
    if (params.sourceType) search.append("sourceType", params.sourceType)
    if (params.companyId) search.append("companyId", params.companyId)
    if (params.search) search.append("search", params.search)
    if (params.sortBy) search.append("sortBy", params.sortBy)
    if (params.sortOrder) search.append("sortOrder", params.sortOrder)
    if (typeof params.limit === "number") search.append("limit", String(params.limit))
    if (typeof params.offset === "number") search.append("offset", String(params.offset))

    const query = search.toString()
    const response = await this.get<ApiSuccessResponse<ListJobSourcesResponse>>(
      `/job-sources${query ? `?${query}` : ""}`
    )
    return response.data
  }

  async getJobSource(id: string): Promise<JobSource> {
    const response = await this.get<ApiSuccessResponse<GetJobSourceResponse>>(`/job-sources/${id}`)
    return response.data.source
  }

  async updateJobSource(
    id: string,
    updates: UpdateJobSourceRequest["updates"]
  ): Promise<JobSource> {
    const response = await this.patch<ApiSuccessResponse<UpdateJobSourceResponse>>(
      `/job-sources/${id}`,
      updates
    )
    return response.data.source
  }

  async deleteJobSource(id: string): Promise<void> {
    await this.delete<ApiSuccessResponse<DeleteJobSourceResponse>>(`/job-sources/${id}`)
  }

  async getStats(): Promise<JobSourceStats> {
    const response = await this.get<ApiSuccessResponse<GetJobSourceStatsResponse>>(
      `/job-sources/stats`
    )
    return response.data.stats
  }
}

export const jobSourcesClient = new JobSourcesClient()
