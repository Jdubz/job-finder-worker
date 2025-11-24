import { BaseApiClient } from "./base-client"
import { API_CONFIG } from "@/config/api"
import type {
  StopList,
  QueueSettings,
  AISettings,
  ListConfigEntriesResponse,
  GetConfigEntryResponse,
  UpsertConfigEntryResponse,
  ApiSuccessResponse,
  PersonalInfo,
} from "@shared/types"

export class ConfigClient extends BaseApiClient {
  constructor(baseUrl: string | (() => string) = () => API_CONFIG.baseUrl) {
    super(baseUrl)
  }

  private async getConfigEntry<T>(id: string): Promise<T | null> {
    try {
      const response = await this.get<ApiSuccessResponse<GetConfigEntryResponse>>(
        `/config/${id}`
      )
      return response.data.config.payload as T
    } catch (error) {
      console.warn(`Failed to fetch config entry ${id}:`, error)
      return null
    }
  }

  private async updateConfigEntry(id: string, payload: unknown) {
    const response = await this.put<ApiSuccessResponse<UpsertConfigEntryResponse>>(`/config/${id}`, {
      payload,
    })
    return response.data.config
  }

  async getStopList(): Promise<StopList | null> {
    return this.getConfigEntry<StopList>("stop-list")
  }

  async updateStopList(stopList: Partial<StopList>): Promise<void> {
    const existing = (await this.getStopList()) ?? {
      excludedCompanies: [],
      excludedDomains: [],
      excludedKeywords: [],
    }
    await this.updateConfigEntry("stop-list", {
      ...existing,
      ...stopList,
    })
  }

  async getQueueSettings(): Promise<QueueSettings | null> {
    return this.getConfigEntry<QueueSettings>("queue-settings")
  }

  async updateQueueSettings(settings: Partial<QueueSettings>): Promise<void> {
    const existing = (await this.getQueueSettings()) ?? {
      maxRetries: 3,
      retryDelaySeconds: 300,
      processingTimeout: 600,
    }
    await this.updateConfigEntry("queue-settings", {
      ...existing,
      ...settings,
    })
  }

  async getAISettings(): Promise<AISettings | null> {
    return this.getConfigEntry<AISettings>("ai-settings")
  }

  async updateAISettings(settings: Partial<AISettings>): Promise<void> {
    const existing = (await this.getAISettings()) ?? {
      provider: "claude",
      model: "claude-sonnet-4",
      minMatchScore: 70,
      costBudgetDaily: 10,
      generateIntakeData: true,
      portlandOfficeBonus: 15,
      userTimezone: -8,
      preferLargeCompanies: true,
    }
    await this.updateConfigEntry("ai-settings", {
      ...existing,
      ...settings,
    })
  }

  async getJobFilters<T = Record<string, unknown>>(): Promise<T | null> {
    return this.getConfigEntry<T>("job-filters")
  }

  async updateJobFilters(filters: unknown): Promise<void> {
    await this.updateConfigEntry("job-filters", filters)
  }

  async getTechnologyRanks<T = Record<string, unknown>>(): Promise<T | null> {
    return this.getConfigEntry<T>("technology-ranks")
  }

  async updateTechnologyRanks(ranks: unknown): Promise<void> {
    await this.updateConfigEntry("technology-ranks", ranks)
  }

  async getSchedulerSettings<T = Record<string, unknown>>(): Promise<T | null> {
    return this.getConfigEntry<T>("scheduler-settings")
  }

  async updateSchedulerSettings(settings: unknown): Promise<void> {
    await this.updateConfigEntry("scheduler-settings", settings)
  }

  async getPersonalInfo(): Promise<PersonalInfo | null> {
    return this.getConfigEntry<PersonalInfo>("personal-info")
  }

  async updatePersonalInfo(
    updates: Partial<PersonalInfo>,
    userEmail: string
  ): Promise<PersonalInfo> {
    const existing = (await this.getPersonalInfo()) ?? {
      name: "",
      email: userEmail,
      accentColor: "#3b82f6",
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

  async getEntry(id: string): Promise<GetConfigEntryResponse["config"] | null> {
    try {
      const response = await this.get<ApiSuccessResponse<GetConfigEntryResponse>>(`/config/${id}`)
      return response.data.config
    } catch (error) {
      console.warn(`Failed to fetch config entry ${id}`, error)
      return null
    }
  }
}

export const configClient = new ConfigClient()
