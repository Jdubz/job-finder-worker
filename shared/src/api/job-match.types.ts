import type { JobMatch, JobMatchWithListing, JobMatchStats } from "../job.types"
import type { PaginationParams } from "../api.types"

export interface ListJobMatchesRequest extends PaginationParams {
  minScore?: number
  maxScore?: number
  jobListingId?: string
  sortBy?: "score" | "date"
  sortOrder?: "asc" | "desc"
}

export interface ListJobMatchesResponse {
  matches: JobMatchWithListing[]
  count: number
}

export interface GetJobMatchResponse {
  match: JobMatchWithListing
}

export type SaveJobMatchRequest = Omit<JobMatch, "id"> & { id?: string }

export interface SaveJobMatchResponse {
  match: JobMatch
}

export interface DeleteJobMatchResponse {
  matchId: string
  deleted: boolean
}

export interface GetJobMatchStatsResponse {
  stats: JobMatchStats
}
