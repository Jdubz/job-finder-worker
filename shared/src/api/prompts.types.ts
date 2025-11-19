import type { PromptConfig } from "../config.types"

export interface GetPromptsResponse {
  prompts: PromptConfig
}

export interface UpdatePromptsRequest {
  prompts: Omit<PromptConfig, "updatedAt" | "updatedBy">
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
