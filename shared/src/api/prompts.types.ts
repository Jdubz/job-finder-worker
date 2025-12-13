import type { PromptConfig } from "../config.types"

export interface GetPromptsResponse {
  prompts: PromptConfig
  /**
   * Hardcoded safety rules that are appended to formFill at runtime.
   * Read-only - cannot be edited via the API.
   */
  formFillSafetyRules: string
}

export interface UpdatePromptsRequest {
  prompts: PromptConfig
  userEmail: string
}

export interface UpdatePromptsResponse {
  prompts: PromptConfig
}

export interface ResetPromptsRequest {
  userEmail: string
}

export interface ResetPromptsResponse {
  prompts: PromptConfig
}
