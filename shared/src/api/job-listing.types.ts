import type { JobListingRecord, JobListingStatus, JobListingStats } from "../job.types"
import type { PaginationParams } from "../api.types"

export interface ListJobListingsRequest extends PaginationParams {
  status?: JobListingStatus
  sourceId?: string
  companyId?: string
  search?: string
  sortBy?: "date" | "title" | "company" | "status"
  sortOrder?: "asc" | "desc"
}

export interface ListJobListingsResponse {
  listings: JobListingRecord[]
  count: number
}

export interface GetJobListingResponse {
  listing: JobListingRecord
}

export interface CreateJobListingRequest {
  url: string
  sourceId?: string
  companyId?: string
  title: string
  companyName: string
  location?: string
  salaryRange?: string
  description: string
  postedDate?: string
  status?: JobListingStatus
  filterResult?: Record<string, unknown>
}

export interface CreateJobListingResponse {
  listing: JobListingRecord
}

export interface UpdateJobListingRequest {
  status?: JobListingStatus
  filterResult?: Record<string, unknown>
  companyId?: string
}

export interface UpdateJobListingResponse {
  listing: JobListingRecord
}

export interface DeleteJobListingResponse {
  listingId: string
  deleted: boolean
}

export interface GetJobListingStatsResponse {
  stats: JobListingStats
}
