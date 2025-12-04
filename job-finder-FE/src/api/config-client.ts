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
    // Fetch existing to merge - throws if not configured
    const existing = await this.getAISettings()
    await this.updateConfigEntry("ai-settings", {
      ...existing,
      options: existing.options, // Preserve options from existing config
      worker: {
        ...existing.worker,
        ...settings.worker,
        selected: {
          ...existing.worker?.selected,
          ...settings.worker?.selected,
        },
        tasks: settings.worker?.tasks ?? existing.worker?.tasks,
      },
      documentGenerator: {
        ...existing.documentGenerator,
        ...settings.documentGenerator,
        selected: {
          ...existing.documentGenerator?.selected,
          ...settings.documentGenerator?.selected,
        },
        tasks: settings.documentGenerator?.tasks ?? existing.documentGenerator?.tasks,
      },
    })
  }

  async getPrefilterPolicy(): Promise<PreFilterPolicy> {
    return this.getConfigEntry<PreFilterPolicy>("prefilter-policy")
  }

  async updatePrefilterPolicy(config: PreFilterPolicy): Promise<void> {
    await this.updateConfigEntry("prefilter-policy", config)
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

  async updateWorkerSettings(settings: Partial<WorkerSettings>): Promise<void> {
    const existing = await this.getWorkerSettings()
    // Deep-merge runtime and other nested objects to avoid clobbering
    const merged = {
      ...existing,
      ...settings,
      scraping: { ...existing.scraping, ...(settings.scraping ?? {}) },
      textLimits: { ...existing.textLimits, ...(settings.textLimits ?? {}) },
      runtime: { ...existing.runtime, ...(settings.runtime ?? {}) },
      health: Object.prototype.hasOwnProperty.call(settings, "health")
        ? settings.health
        : existing.health,
      cache: Object.prototype.hasOwnProperty.call(settings, "cache") ? settings.cache : existing.cache,
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
