import { BaseApiClient } from "./base-client"
import { API_CONFIG } from "@/config/api"
import type {
  AISettings,
  ListConfigEntriesResponse,
  GetConfigEntryResponse,
  UpsertConfigEntryResponse,
  ApiSuccessResponse,
  PersonalInfo,
  WorkerSettings,
  MatchPolicy,
  PreFilterPolicy,
} from "@shared/types"
import { DEFAULT_AI_SETTINGS, DEFAULT_PERSONAL_INFO } from "@shared/types"

export class ConfigClient extends BaseApiClient {
  constructor(baseUrl: string | (() => string) = () => API_CONFIG.baseUrl) {
    super(baseUrl)
  }

  private async getConfigEntry<T>(id: string): Promise<T> {
    const response = await this.get<ApiSuccessResponse<GetConfigEntryResponse>>(
      `/config/${id}`
    )
    return response.data.config.payload as T
  }

  private async updateConfigEntry(id: string, payload: unknown) {
    const response = await this.put<ApiSuccessResponse<UpsertConfigEntryResponse>>(`/config/${id}`, {
      payload,
    })
    return response.data.config
  }

  async getAISettings(): Promise<AISettings> {
    return this.getConfigEntry<AISettings>("ai-settings")
  }

  async updateAISettings(settings: Partial<AISettings>): Promise<void> {
    let existing: AISettings
    try {
      existing = await this.getAISettings()
    } catch {
      existing = DEFAULT_AI_SETTINGS
    }
    const legacySelected = (settings as Partial<{ selected: AISettings["worker"]["selected"] }>).selected

    await this.updateConfigEntry("ai-settings", {
      worker: {
        selected: {
          ...existing.worker.selected,
          ...(settings.worker?.selected ?? legacySelected ?? {}),
        },
      },
      documentGenerator: {
        selected: {
          ...existing.documentGenerator.selected,
          ...(settings.documentGenerator?.selected ?? legacySelected ?? {}),
        },
      },
      options: existing.options ?? DEFAULT_AI_SETTINGS.options,
    })
  }

  async getPrefilterPolicy(): Promise<PreFilterPolicy> {
    return this.getConfigEntry<PreFilterPolicy>("prefilter-policy")
  }

  async updatePrefilterPolicy(config: PreFilterPolicy): Promise<void> {
    await this.updateConfigEntry("prefilter-policy", config)
  }

  async getMatchPolicy(): Promise<MatchPolicy> {
    // No fallback - match-policy is required
    return this.getConfigEntry<MatchPolicy>("match-policy")
  }

  async updateMatchPolicy(config: MatchPolicy): Promise<void> {
    await this.updateConfigEntry("match-policy", config)
  }

  async getWorkerSettings(): Promise<WorkerSettings> {
    return this.getConfigEntry<WorkerSettings>("worker-settings")
  }

  async updateWorkerSettings(settings: Partial<WorkerSettings>): Promise<void> {
    const existing = await this.getWorkerSettings()
    // Deep-merge runtime and other nested objects to avoid clobbering
    const merged = {
      ...existing,
      ...settings,
      scraping: { ...existing.scraping, ...(settings.scraping ?? {}) },
      textLimits: { ...existing.textLimits, ...(settings.textLimits ?? {}) },
      runtime: { ...existing.runtime, ...(settings.runtime ?? {}) },
    }
    await this.updateConfigEntry("worker-settings", merged)
  }

  // Backward-compat convenience wrappers (runtime settings)
  async getQueueSettings(): Promise<WorkerSettings["runtime"]> {
    const ws = await this.getWorkerSettings()
    return ws.runtime
  }

  async updateQueueSettings(settings: Partial<WorkerSettings["runtime"]>): Promise<void> {
    const ws = await this.getWorkerSettings()
    const runtime = { ...ws.runtime, ...settings }
    await this.updateWorkerSettings({ ...ws, runtime })
  }

  async getPersonalInfo(): Promise<PersonalInfo> {
    return this.getConfigEntry<PersonalInfo>("personal-info")
  }

  async updatePersonalInfo(
    updates: Partial<PersonalInfo>,
    userEmail: string
  ): Promise<PersonalInfo> {
    let existing: PersonalInfo
    try {
      existing = await this.getPersonalInfo()
    } catch {
      existing = {
        ...DEFAULT_PERSONAL_INFO,
        email: userEmail || DEFAULT_PERSONAL_INFO.email,
      }
    }

    const payload: PersonalInfo = {
      ...existing,
      ...updates,
      email: updates.email ?? existing.email ?? userEmail,
    }

    await this.updateConfigEntry("personal-info", payload)
    return payload
  }

  async listEntries(): Promise<ListConfigEntriesResponse["configs"]> {
    const response = await this.get<ApiSuccessResponse<ListConfigEntriesResponse>>(`/config`)
    return response.data.configs
  }

  async getEntry(id: string): Promise<GetConfigEntryResponse["config"]> {
    const response = await this.get<ApiSuccessResponse<GetConfigEntryResponse>>(`/config/${id}`)
    return response.data.config
  }
}

export const configClient = new ConfigClient()
