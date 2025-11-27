/**
 * Company API Types
 *
 * Type definitions for company management API endpoints.
 * Handles company listing, filtering, and retrieval.
 */

import type { PaginationParams, PaginationMeta } from "../api.types"
import type { Company } from "../job.types"

/**
 * List Companies Request
 * Query parameters for listing companies with filters
 */
export interface ListCompaniesRequest extends PaginationParams {
  /** Filter by industry */
  industry?: string
  /** Filter by tier (S/A/B/C/D) */
  tier?: Company["tier"]
  /** Search by name (partial match) */
  search?: string
  /** Sort field */
  sortBy?: "name" | "created_at" | "updated_at" | "priority_score" | "tier"
  /** Sort order */
  sortOrder?: "asc" | "desc"
}

/**
 * List Companies Response
 * Response payload for company list endpoint
 */
export interface ListCompaniesResponse {
  items: Company[]
  pagination: PaginationMeta
}

/**
 * Get Company Request
 * Path parameters for fetching a single company
 */
export interface GetCompanyRequest {
  companyId: string
}

/**
 * Get Company Response
 * Response payload for single company fetch
 */
export interface GetCompanyResponse {
  company: Company
}

/**
 * Update Company Request
 * Request payload for updating company data
 */
export interface UpdateCompanyRequest {
  companyId: string
  updates: Partial<Omit<Company, "id" | "createdAt" | "updatedAt">>
}

/**
 * Update Company Response
 * Response payload for company update
 */
export interface UpdateCompanyResponse {
  company: Company
  message?: string
}

/**
 * Delete Company Request
 * Path parameters for deleting a company
 */
export interface DeleteCompanyRequest {
  companyId: string
}

/**
 * Delete Company Response
 * Response payload for company deletion
 */
export interface DeleteCompanyResponse {
  message: string
}
