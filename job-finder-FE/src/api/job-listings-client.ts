import { BaseApiClient } from "./base-client"
import { API_CONFIG } from "@/config/api"
import type {
  ApiSuccessResponse,
  JobListingRecord,
  ListJobListingsResponse,
  GetJobListingResponse,
  DeleteJobListingResponse,
  JobListingStatus,
  JobListingStats,
  GetJobListingStatsResponse,
} from "@shared/types"

export interface JobListingFilters {
  status?: JobListingStatus
  sourceId?: string
  companyId?: string
  search?: string
  sortBy?: "date" | "title" | "company" | "status" | "updated"
  sortOrder?: "asc" | "desc"
  limit?: number
  offset?: number
}

type JobListingsResponseShape =
  | ApiSuccessResponse<ListJobListingsResponse>
  | ListJobListingsResponse
type JobListingResponseShape = ApiSuccessResponse<GetJobListingResponse> | GetJobListingResponse

export class JobListingsClient extends BaseApiClient {
  constructor(baseUrl: string | (() => string) = () => API_CONFIG.baseUrl) {
    super(baseUrl)
  }

  private buildQuery(filters: JobListingFilters = {}): string {
    const params = new URLSearchParams()
    if (filters.status) params.set("status", filters.status)
    if (filters.sourceId) params.set("sourceId", filters.sourceId)
    if (filters.companyId) params.set("companyId", filters.companyId)
    if (filters.search) params.set("search", filters.search)
    if (filters.sortBy) params.set("sortBy", filters.sortBy)
    if (filters.sortOrder) params.set("sortOrder", filters.sortOrder)
    if (filters.limit !== undefined) params.set("limit", String(filters.limit))
    if (filters.offset !== undefined) params.set("offset", String(filters.offset))
    return params.toString()
  }

  private unwrapListings(response: JobListingsResponseShape): {
    listings: JobListingRecord[]
    count: number
  } {
    const payload = "data" in response ? response.data : response
    return {
      listings: payload?.listings ?? [],
      count: payload?.count ?? 0,
    }
  }

  private unwrapListing(response: JobListingResponseShape): JobListingRecord {
    const payload = "data" in response ? response.data : response
    if (!payload?.listing) {
      throw new Error("Listing not found in response")
    }
    return payload.listing
  }

  async listListings(
    filters: JobListingFilters = {}
  ): Promise<{ listings: JobListingRecord[]; count: number }> {
    const query = this.buildQuery(filters)
    const response = await this.get<JobListingsResponseShape>(
      `/job-listings${query ? `?${query}` : ""}`
    )
    return this.unwrapListings(response)
  }

  async getListing(id: string): Promise<JobListingRecord> {
    const response = await this.get<JobListingResponseShape>(`/job-listings/${id}`)
    return this.unwrapListing(response)
  }

  async deleteListing(id: string): Promise<boolean> {
    const response = await this.delete<ApiSuccessResponse<DeleteJobListingResponse>>(
      `/job-listings/${id}`
    )
    const payload = "data" in response ? response.data : response
    return (payload as DeleteJobListingResponse)?.deleted ?? false
  }

  /**
   * Get stats for job listings grouped by status.
   * Used for accurate summary pill totals.
   */
  async getStats(): Promise<JobListingStats> {
    const response = await this.get<ApiSuccessResponse<GetJobListingStatsResponse>>(
      "/job-listings/stats"
    )
    const payload = "data" in response ? response.data : response
    return (payload as GetJobListingStatsResponse).stats
  }
}

export const jobListingsClient = new JobListingsClient()
