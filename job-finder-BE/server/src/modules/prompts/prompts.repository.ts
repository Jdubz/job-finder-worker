import type { PromptConfig } from "@shared/types"
import { DEFAULT_PROMPTS } from "@shared/types"
import { ConfigRepository } from "../config/config.repository"

const PROMPTS_CONFIG_ID = "ai-prompts"

export class PromptsRepository {
  private readonly configRepo = new ConfigRepository()

  getPrompts(): PromptConfig {
    const entry = this.configRepo.get<PromptConfig>(PROMPTS_CONFIG_ID)
    return entry?.payload ?? DEFAULT_PROMPTS
  }

  savePrompts(prompts: PromptConfig, updatedBy?: string): PromptConfig {
    return this.configRepo.upsert<PromptConfig>(PROMPTS_CONFIG_ID, prompts, { updatedBy }).payload
  }
}
