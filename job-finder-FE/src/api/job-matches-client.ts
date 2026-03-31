import { BaseApiClient } from "./base-client"
import { API_CONFIG } from "@/config/api"
import type {
  ApiSuccessResponse,
  JobMatchWithListing,
  ListJobMatchesResponse,
  GetJobMatchResponse,
  JobMatchStats,
  GetJobMatchStatsResponse,
  JobMatchStatus,
  ApplicationEmail,
  ApplicationStatusHistory,
} from "@shared/types"

export interface JobMatchFilters {
  minScore?: number
  maxScore?: number
  jobListingId?: string
  limit?: number
  offset?: number
  sortBy?: "score" | "date" | "updated"
  sortOrder?: "asc" | "desc"
  status?: JobMatchStatus | "all"
  search?: string
}

type JobMatchesResponseShape =
  | ApiSuccessResponse<ListJobMatchesResponse>
  | ListJobMatchesResponse
type JobMatchResponseShape = ApiSuccessResponse<GetJobMatchResponse> | GetJobMatchResponse

export class JobMatchesClient extends BaseApiClient {
  constructor(baseUrl: string | (() => string) = () => API_CONFIG.baseUrl) {
    super(baseUrl)
  }

  private buildQuery(filters: JobMatchFilters = {}): string {
    const params = new URLSearchParams()
    if (filters.minScore !== undefined) params.set("minScore", String(filters.minScore))
    if (filters.maxScore !== undefined) params.set("maxScore", String(filters.maxScore))
    if (filters.jobListingId) params.set("jobListingId", filters.jobListingId)
    if (filters.limit !== undefined) params.set("limit", String(filters.limit))
    if (filters.offset !== undefined) params.set("offset", String(filters.offset))
    if (filters.sortBy) params.set("sortBy", filters.sortBy)
    if (filters.sortOrder) params.set("sortOrder", filters.sortOrder)
    if (filters.status) params.set("status", filters.status)
    if (filters.search) params.set("search", filters.search)
    return params.toString()
  }

  private unwrapMatches(response: JobMatchesResponseShape): JobMatchWithListing[] {
    const payload = "data" in response ? response.data : response
    return payload?.matches ?? []
  }

  private unwrapMatch(response: JobMatchResponseShape): JobMatchWithListing {
    const payload = "data" in response ? response.data : response
    if (!payload?.match) {
      throw new Error("Match not found in response")
    }
    return payload.match
  }

  async listMatches(filters: JobMatchFilters = {}): Promise<JobMatchWithListing[]> {
    const query = this.buildQuery(filters)
    const response = await this.get<JobMatchesResponseShape>(
      `/job-matches${query ? `?${query}` : ""}`
    )
    return this.unwrapMatches(response)
  }

  async getMatch(matchId: string): Promise<JobMatchWithListing> {
    const response = await this.get<JobMatchResponseShape>(`/job-matches/${matchId}`)
    return this.unwrapMatch(response)
  }

  async updateStatus(matchId: string, status: JobMatchStatus, statusNote?: string | null) {
    const body: Record<string, unknown> = { status }
    if (statusNote !== undefined) body.statusNote = statusNote
    const response = await this.patch<ApiSuccessResponse<{ match: JobMatchWithListing }>>(
      `/job-matches/${matchId}/status`,
      body
    )
    const payload: { match: JobMatchWithListing } =
      "data" in response ? response.data : (response as { match: JobMatchWithListing })
    return payload.match
  }

  async createGhostMatch(data: { company: string; title: string; url?: string; notes?: string }) {
    const response = await this.post<ApiSuccessResponse<{ match: JobMatchWithListing }>>(
      "/job-matches/ghost",
      data
    )
    const payload = "data" in response ? response.data : (response as { match: JobMatchWithListing })
    return payload.match
  }

  async getApplicationEmails(matchId: string): Promise<ApplicationEmail[]> {
    const response = await this.get<ApiSuccessResponse<{ emails: ApplicationEmail[] }>>(
      `/job-matches/${matchId}/emails`
    )
    const payload = "data" in response ? response.data : (response as { emails: ApplicationEmail[] })
    return payload.emails ?? []
  }

  async getStatusHistory(matchId: string): Promise<ApplicationStatusHistory[]> {
    const response = await this.get<ApiSuccessResponse<{ history: ApplicationStatusHistory[] }>>(
      `/job-matches/${matchId}/status-history`
    )
    const payload = "data" in response ? response.data : (response as { history: ApplicationStatusHistory[] })
    return payload.history ?? []
  }

  async triggerTrackerScan() {
    const response = await this.post<ApiSuccessResponse<{ results: unknown[] }>>(
      "/gmail/tracker/scan",
      {}
    )
    return "data" in response ? response.data : response
  }

  subscribeToMatches(
    callback: (matches: JobMatchWithListing[]) => void,
    filters?: JobMatchFilters,
    onError?: (error: Error) => void,
    pollIntervalMs = 10000
  ): () => void {
    let stopped = false

    const poll = async () => {
      try {
        const matches = await this.listMatches(filters)
        if (!stopped) {
          callback(matches)
        }
      } catch (error) {
        if (!stopped && onError) {
          onError(error as Error)
        }
      } finally {
        if (!stopped) {
          setTimeout(poll, pollIntervalMs)
        }
      }
    }

    poll()

    return () => {
      stopped = true
    }
  }

  /**
   * Get stats for job matches grouped by score range.
   * Uses server-side aggregation for accurate totals.
   */
  async getStats(includeIgnored = false): Promise<JobMatchStats> {
    const query = includeIgnored ? "?includeIgnored=true" : ""
    const response = await this.get<ApiSuccessResponse<GetJobMatchStatsResponse>>(
      `/job-matches/stats${query}`
    )
    const payload = "data" in response ? response.data : response
    return (payload as GetJobMatchStatsResponse).stats
  }
}

export const jobMatchesClient = new JobMatchesClient()
