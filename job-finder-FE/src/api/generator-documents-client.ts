import { BaseApiClient } from "./base-client"
import { API_CONFIG } from "@/config/api"
import type {
  ApiSuccessResponse,
  GeneratorDocumentRecord,
  ListGeneratorDocumentsResponse,
  GetGeneratorDocumentResponse,
  UpsertGeneratorDocumentResponse,
} from "@shared/types"

export class GeneratorDocumentsClient extends BaseApiClient {
  constructor(baseUrl = API_CONFIG.baseUrl) {
    super(baseUrl)
  }

  async listDocuments(type?: string): Promise<GeneratorDocumentRecord[]> {
    const query = type ? `?type=${encodeURIComponent(type)}` : ""
    const response = await this.get<ApiSuccessResponse<ListGeneratorDocumentsResponse>>(
      `/generator-docs${query}`
    )
    return response.data.documents
  }

  async getDocument(id: string): Promise<GeneratorDocumentRecord | null> {
    const response = await this.get<ApiSuccessResponse<GetGeneratorDocumentResponse>>(
      `/generator-docs/${id}`
    )
    return response.data.document
  }

  async upsertDocument(
    id: string,
    payload: { documentType: string; data: Record<string, unknown> }
  ): Promise<GeneratorDocumentRecord> {
    const response = await this.put<ApiSuccessResponse<UpsertGeneratorDocumentResponse>>(
      `/generator-docs/${id}`,
      {
        documentType: payload.documentType,
        payload: payload.data,
      }
    )
    return response.data.document
  }

  async deleteDocument(id: string): Promise<void> {
    await this.delete(`/generator-docs/${id}`)
  }
}

export const generatorDocumentsClient = new GeneratorDocumentsClient()
