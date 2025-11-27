import { BaseApiClient } from "./base-client"
import { API_CONFIG } from "@/config/api"
import type {
  Company,
  ListCompaniesRequest,
  ListCompaniesResponse,
  GetCompanyResponse,
  UpdateCompanyRequest,
  UpdateCompanyResponse,
  DeleteCompanyResponse
} from "@shared/types"
import type { ApiSuccessResponse } from "@shared/types"

export type ListCompaniesParams = Omit<ListCompaniesRequest, "limit" | "offset"> & {
  limit?: number
  offset?: number
}

export class CompaniesClient extends BaseApiClient {
  constructor(baseUrl: string | (() => string) = () => API_CONFIG.baseUrl) {
    super(baseUrl)
  }

  async listCompanies(params: ListCompaniesParams = {}): Promise<ListCompaniesResponse> {
    const search = new URLSearchParams()

    if (params.industry) search.append("industry", params.industry)
    if (params.tier) search.append("tier", params.tier)
    if (params.analysisStatus) search.append("analysisStatus", params.analysisStatus)
    if (params.search) search.append("search", params.search)
    if (params.sortBy) search.append("sortBy", params.sortBy)
    if (params.sortOrder) search.append("sortOrder", params.sortOrder)
    if (typeof params.limit === "number") search.append("limit", String(params.limit))
    if (typeof params.offset === "number") search.append("offset", String(params.offset))

    const query = search.toString()
    const response = await this.get<ApiSuccessResponse<ListCompaniesResponse>>(
      `/companies${query ? `?${query}` : ""}`
    )
    return response.data
  }

  async getCompany(id: string): Promise<Company> {
    const response = await this.get<ApiSuccessResponse<GetCompanyResponse>>(`/companies/${id}`)
    return response.data.company
  }

  async updateCompany(
    id: string,
    updates: UpdateCompanyRequest["updates"]
  ): Promise<Company> {
    const response = await this.patch<ApiSuccessResponse<UpdateCompanyResponse>>(
      `/companies/${id}`,
      updates
    )
    return response.data.company
  }

  async deleteCompany(id: string): Promise<void> {
    await this.delete<ApiSuccessResponse<DeleteCompanyResponse>>(`/companies/${id}`)
  }
}

export const companiesClient = new CompaniesClient()
