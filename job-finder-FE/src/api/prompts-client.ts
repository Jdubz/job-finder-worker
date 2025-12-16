import { BaseApiClient } from "./base-client"
import { API_CONFIG } from "@/config/api"
import type {
  ApiSuccessResponse,
  PromptConfig,
  GetPromptsResponse,
  UpdatePromptsResponse,
  ResetPromptsResponse,
} from "@shared/types"

export class PromptsClient extends BaseApiClient {
  constructor(baseUrl: string | (() => string) = () => API_CONFIG.baseUrl) {
    super(baseUrl)
  }

  async getPrompts(): Promise<PromptConfig> {
    const response = await this.get<ApiSuccessResponse<GetPromptsResponse>>("/prompts")
    return response.data.prompts
  }

  async savePrompts(
    prompts: Omit<PromptConfig, "updatedAt" | "updatedBy">,
    userEmail: string
  ): Promise<void> {
    await this.put<ApiSuccessResponse<UpdatePromptsResponse>>("/prompts", {
      prompts,
      userEmail,
    })
  }

  async resetToDefaults(userEmail: string): Promise<void> {
    await this.post<ApiSuccessResponse<ResetPromptsResponse>>("/prompts/reset", {
      userEmail,
    })
  }

  validatePrompt(
    prompt: string,
    requiredVariables: string[]
  ): {
    valid: boolean
    missing: string[]
  } {
    const regex = /\{\{(\w+)\}\}/g
    const foundVariables = new Set<string>()
    let match

    while ((match = regex.exec(prompt)) !== null) {
      foundVariables.add(match[1])
    }

    const missing = requiredVariables.filter((variable) => !foundVariables.has(variable))

    return {
      valid: missing.length === 0,
      missing,
    }
  }

  extractVariables(prompt: string): string[] {
    const regex = /\{\{(\w+)\}\}/g
    const variables: string[] = []
    let match

    while ((match = regex.exec(prompt)) !== null) {
      if (!variables.includes(match[1])) {
        variables.push(match[1])
      }
    }

    return variables
  }
}

export const promptsClient = new PromptsClient()
