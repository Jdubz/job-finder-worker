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
  SchedulerSettings,
  WorkerSettings,
  PrefilterPolicy,
  MatchPolicy,
} from "@shared/types"
import { DEFAULT_AI_SETTINGS, DEFAULT_PERSONAL_INFO } from "@shared/types"

export class ConfigClient extends BaseApiClient {
  constructor(baseUrl: string | (() => string) = () => API_CONFIG.baseUrl) {
    super(baseUrl)
  }

  private async getConfigEntry<T>(id: string): Promise<T | null> {
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

  async getQueueSettings(): Promise<QueueSettings | null> {
    return this.getConfigEntry<QueueSettings>("queue-settings")
  }

  async updateQueueSettings(settings: Partial<QueueSettings>): Promise<void> {
    const existing = (await this.getQueueSettings()) ?? {
      processingTimeoutSeconds: 1800,
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
    const existing = (await this.getAISettings()) ?? DEFAULT_AI_SETTINGS
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

  async getPrefilterPolicy(): Promise<PrefilterPolicy | null> {
    return this.getConfigEntry<PrefilterPolicy>("prefilter-policy")
  }

  async updatePrefilterPolicy(policy: PrefilterPolicy): Promise<void> {
    await this.updateConfigEntry("prefilter-policy", policy)
  }

  async getMatchPolicy(): Promise<MatchPolicy | null> {
    return this.getConfigEntry<MatchPolicy>("match-policy")
  }

  async updateMatchPolicy(policy: MatchPolicy): Promise<void> {
    await this.updateConfigEntry("match-policy", policy)
  }

  async getSchedulerSettings(): Promise<SchedulerSettings | null> {
    return this.getConfigEntry<SchedulerSettings>("scheduler-settings")
  }

  async updateSchedulerSettings(settings: SchedulerSettings): Promise<void> {
    await this.updateConfigEntry("scheduler-settings", settings)
  }

  async getWorkerSettings(): Promise<WorkerSettings | null> {
    return this.getConfigEntry<WorkerSettings>("worker-settings")
  }

  async updateWorkerSettings(settings: WorkerSettings): Promise<void> {
    await this.updateConfigEntry("worker-settings", settings)
  }

  async getPersonalInfo(): Promise<PersonalInfo | null> {
    return this.getConfigEntry<PersonalInfo>("personal-info")
  }

  async updatePersonalInfo(
    updates: Partial<PersonalInfo>,
    userEmail: string
  ): Promise<PersonalInfo> {
    const existing =
      (await this.getPersonalInfo()) ??
      {
        ...DEFAULT_PERSONAL_INFO,
        email: userEmail || DEFAULT_PERSONAL_INFO.email,
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
    const response = await this.get<ApiSuccessResponse<GetConfigEntryResponse>>(`/config/${id}`)
    return response.data.config
  }
}

export const configClient = new ConfigClient()
