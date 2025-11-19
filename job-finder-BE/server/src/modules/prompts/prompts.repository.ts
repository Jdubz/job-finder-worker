import type { PromptConfig } from "@shared/types"
import { DEFAULT_PROMPTS } from "@shared/types"
import { ConfigRepository } from "../config/config.repository"

const PROMPTS_CONFIG_ID = "ai-prompts"

export class PromptsRepository {
  private readonly configRepo = new ConfigRepository()

  getPrompts(): PromptConfig {
    const entry = this.configRepo.get(PROMPTS_CONFIG_ID)
    if (!entry) {
      return DEFAULT_PROMPTS
    }

    return entry.payload as PromptConfig
  }

  savePrompts(prompts: PromptConfig): PromptConfig {
    this.configRepo.upsert(PROMPTS_CONFIG_ID, prompts)
    return this.getPrompts()
  }
}
