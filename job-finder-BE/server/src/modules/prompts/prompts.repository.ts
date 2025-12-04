import type { PromptConfig } from "@shared/types"
import { ConfigRepository } from "../config/config.repository"

const PROMPTS_CONFIG_ID = "ai-prompts"

export class PromptsRepository {
  private readonly configRepo = new ConfigRepository()

  getPrompts(): PromptConfig {
    const entry = this.configRepo.get<PromptConfig>(PROMPTS_CONFIG_ID)
    if (!entry?.payload) {
      throw new Error(`Prompts configuration '${PROMPTS_CONFIG_ID}' not found - must be configured in database`)
    }
    return entry.payload
  }

  savePrompts(prompts: PromptConfig, updatedBy?: string): PromptConfig {
    return this.configRepo.upsert<PromptConfig>(PROMPTS_CONFIG_ID, prompts, { updatedBy }).payload
  }
}
