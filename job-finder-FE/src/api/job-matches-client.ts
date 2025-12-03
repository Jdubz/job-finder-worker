import { BaseApiClient } from "./base-client"
import { API_CONFIG } from "@/config/api"
import { SCORE_THRESHOLDS } from "@/lib/score-utils"
import type {
  ApiSuccessResponse,
  JobMatchWithListing,
  ListJobMatchesResponse,
  GetJobMatchResponse,
} from "@shared/types"

export interface JobMatchFilters {
  minScore?: number
  maxScore?: number
  jobListingId?: string
  limit?: number
  offset?: number
  sortBy?: "score" | "date"
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
    if (filters.jobListingId) params.set("jobListingId", filters.jobListingId)
    if (filters.limit !== undefined) params.set("limit", String(filters.limit))
    if (filters.offset !== undefined) params.set("offset", String(filters.offset))
    if (filters.sortBy) params.set("sortBy", filters.sortBy)
    if (filters.sortOrder) params.set("sortOrder", filters.sortOrder)
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

  async getMatchStats(): Promise<{
    total: number
    highScore: number
    mediumScore: number
    lowScore: number
    averageScore: number
  }> {
    const matches = await this.listMatches()
    const stats = {
      total: matches.length,
      highScore: matches.filter((m) => m.matchScore >= SCORE_THRESHOLDS.HIGH).length,
      mediumScore: matches.filter(
        (m) => m.matchScore >= SCORE_THRESHOLDS.MEDIUM && m.matchScore < SCORE_THRESHOLDS.HIGH
      ).length,
      lowScore: matches.filter((m) => m.matchScore < SCORE_THRESHOLDS.MEDIUM).length,
      averageScore: 0,
    }

    if (matches.length > 0) {
      stats.averageScore = matches.reduce((sum, m) => sum + m.matchScore, 0) / matches.length
    }

    return stats
  }
}

export const jobMatchesClient = new JobMatchesClient()
