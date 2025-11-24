import { BaseApiClient } from "./base-client"
import { API_CONFIG } from "@/config/api"
import type {
  ApiSuccessResponse,
  JobMatch,
  ListJobMatchesResponse,
  GetJobMatchResponse,
} from "@shared/types"

export interface JobMatchFilters {
  minScore?: number
  maxScore?: number
  companyName?: string
  priority?: JobMatch["applicationPriority"]
  limit?: number
  offset?: number
  sortBy?: "score" | "date" | "company"
  sortOrder?: "asc" | "desc"
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
    if (filters.companyName) params.set("companyName", filters.companyName)
    if (filters.priority) params.set("priority", filters.priority)
    if (filters.limit !== undefined) params.set("limit", String(filters.limit))
    if (filters.offset !== undefined) params.set("offset", String(filters.offset))
    if (filters.sortBy) params.set("sortBy", filters.sortBy)
    if (filters.sortOrder) params.set("sortOrder", filters.sortOrder)
    return params.toString()
  }

  private unwrapMatches(response: JobMatchesResponseShape): JobMatch[] {
    const payload = "data" in response ? response.data : response
    return payload?.matches ?? []
  }

  private unwrapMatch(response: JobMatchResponseShape): JobMatch | null {
    const payload = "data" in response ? response.data : response
    return payload?.match ?? null
  }

  async getMatches(filters: JobMatchFilters = {}): Promise<JobMatch[]> {
    const query = this.buildQuery(filters)
    const response = await this.get<JobMatchesResponseShape>(
      `/job-matches${query ? `?${query}` : ""}`
    )
    return this.unwrapMatches(response)
  }

  async getMatch(matchId: string): Promise<JobMatch | null> {
    try {
      const response = await this.get<JobMatchResponseShape>(`/job-matches/${matchId}`)
      return this.unwrapMatch(response)
    } catch (error) {
      console.warn(`Failed to fetch job match ${matchId}`, error)
      return null
    }
  }

  subscribeToMatches(
    callback: (matches: JobMatch[]) => void,
    filters?: JobMatchFilters,
    onError?: (error: Error) => void,
    pollIntervalMs = 10000
  ): () => void {
    let stopped = false

    const poll = async () => {
      try {
        const matches = await this.getMatches(filters)
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

  async getMatchStats(): Promise<{
    total: number
    highPriority: number
    mediumPriority: number
    lowPriority: number
    averageScore: number
  }> {
    const matches = await this.getMatches()
    const stats = {
      total: matches.length,
      highPriority: matches.filter((m) => m.applicationPriority === "High").length,
      mediumPriority: matches.filter((m) => m.applicationPriority === "Medium").length,
      lowPriority: matches.filter((m) => m.applicationPriority === "Low").length,
      averageScore: 0,
    }

    if (matches.length > 0) {
      stats.averageScore = matches.reduce((sum, m) => sum + m.matchScore, 0) / matches.length
    }

    return stats
  }
}

export const jobMatchesClient = new JobMatchesClient()
