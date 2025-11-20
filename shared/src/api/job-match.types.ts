import type { JobMatch } from "../job.types"
import type { PaginationParams } from "../api.types"

export interface ListJobMatchesRequest extends PaginationParams {
  minScore?: number
  maxScore?: number
  companyName?: string
  priority?: JobMatch["applicationPriority"]
  sortBy?: "score" | "date" | "company"
  sortOrder?: "asc" | "desc"
}

export interface ListJobMatchesResponse {
  matches: JobMatch[]
  count: number
}

export interface GetJobMatchResponse {
  match: JobMatch
}

export type SaveJobMatchRequest = JobMatch

export interface SaveJobMatchResponse {
  match: JobMatch
}

export interface DeleteJobMatchResponse {
  matchId: string
  deleted: boolean
}
