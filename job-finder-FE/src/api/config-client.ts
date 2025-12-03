import { BaseApiClient } from "./base-client"
import { API_CONFIG } from "@/config/api"
import type {
  QueueSettings,
  AISettings,
  ListConfigEntriesResponse,
  GetConfigEntryResponse,
  UpsertConfigEntryResponse,
  ApiSuccessResponse,
  PersonalInfo,
  WorkerSettings,
  TitleFilterConfig,
  MatchPolicy,
} from "@shared/types"

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

  async getQueueSettings(): Promise<QueueSettings> {
    return this.getConfigEntry<QueueSettings>("queue-settings")
  }

  async updateQueueSettings(settings: Partial<QueueSettings>): Promise<void> {
    // Fetch existing to merge - throws if not configured
    const existing = await this.getQueueSettings()
    await this.updateConfigEntry("queue-settings", { ...existing, ...settings })
  }

  async getAISettings(): Promise<AISettings> {
    return this.getConfigEntry<AISettings>("ai-settings")
  }

  async updateAISettings(settings: Partial<AISettings>): Promise<void> {
    // Fetch existing to merge - throws if not configured
    const existing = await this.getAISettings()
    await this.updateConfigEntry("ai-settings", {
      ...existing,
      worker: {
        ...existing.worker,
        ...settings.worker,
        selected: {
          ...existing.worker?.selected,
          ...settings.worker?.selected,
        },
      },
      documentGenerator: {
        ...existing.documentGenerator,
        ...settings.documentGenerator,
        selected: {
          ...existing.documentGenerator?.selected,
          ...settings.documentGenerator?.selected,
        },
      },
    })
  }

  async getTitleFilter(): Promise<TitleFilterConfig> {
    return this.getConfigEntry<TitleFilterConfig>("title-filter")
  }

  async updateTitleFilter(config: TitleFilterConfig): Promise<void> {
    await this.updateConfigEntry("title-filter", config)
  }

  async getMatchPolicy(): Promise<MatchPolicy> {
    return this.getConfigEntry<MatchPolicy>("match-policy")
  }

  async updateMatchPolicy(config: MatchPolicy): Promise<void> {
    await this.updateConfigEntry("match-policy", config)
  }

  async getWorkerSettings(): Promise<WorkerSettings> {
    return this.getConfigEntry<WorkerSettings>("worker-settings")
  }

  async updateWorkerSettings(settings: WorkerSettings): Promise<void> {
    await this.updateConfigEntry("worker-settings", settings)
  }

  async getPersonalInfo(): Promise<PersonalInfo> {
    return this.getConfigEntry<PersonalInfo>("personal-info")
  }

  async updatePersonalInfo(
    updates: Partial<PersonalInfo>,
    userEmail?: string
  ): Promise<PersonalInfo> {
    // Fetch existing to merge - throws if not configured
    const existing = await this.getPersonalInfo()
    const payload: PersonalInfo = {
      ...existing,
      ...updates,
      email: updates.email ?? existing.email ?? userEmail ?? "",
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
