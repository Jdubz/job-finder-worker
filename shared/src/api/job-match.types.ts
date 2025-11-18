import type { JobMatch } from "../job.types"

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
