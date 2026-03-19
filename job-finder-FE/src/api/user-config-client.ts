import { BaseApiClient } from "./base-client"
import { API_CONFIG } from "@/config/api"
import type {
  GetUserConfigListResponse,
  GetUserConfigResponse,
  UpsertUserConfigResponse,
  UserConfigKey,
} from "@shared/types"
import type { ApiSuccessResponse, PersonalInfo, MatchPolicy, PreFilterPolicy } from "@shared/types"

export class UserConfigClient extends BaseApiClient {
  constructor(baseUrl: string | (() => string) = () => API_CONFIG.baseUrl) {
    super(baseUrl)
  }

  /** GET /api/user-config - list all user configs for the authenticated user */
  async listUserConfigs(): Promise<GetUserConfigListResponse> {
    const response = await this.get<ApiSuccessResponse<{ configs: GetUserConfigListResponse }>>(
      "/user-config"
    )
    return response.data.configs
  }

  /** GET /api/user-config/:key - get a single user config by key */
  async getUserConfig<T = unknown>(key: UserConfigKey): Promise<T> {
    const response = await this.get<ApiSuccessResponse<{ config: GetUserConfigResponse }>>(
      `/user-config/${key}`
    )
    return response.data.config.payload as T
  }

  /** PUT /api/user-config/:key - create or update a user config */
  async upsertUserConfig(key: UserConfigKey, payload: unknown): Promise<UpsertUserConfigResponse> {
    const response = await this.put<ApiSuccessResponse<{ config: UpsertUserConfigResponse }>>(
      `/user-config/${key}`,
      { payload }
    )
    return response.data.config
  }

  // Typed convenience methods

  async getPrefilterPolicy(): Promise<PreFilterPolicy> {
    return this.getUserConfig<PreFilterPolicy>("prefilter-policy")
  }

  async updatePrefilterPolicy(config: PreFilterPolicy): Promise<void> {
    await this.upsertUserConfig("prefilter-policy", config)
  }

  async getMatchPolicy(): Promise<MatchPolicy> {
    return this.getUserConfig<MatchPolicy>("match-policy")
  }

  async updateMatchPolicy(config: MatchPolicy): Promise<void> {
    await this.upsertUserConfig("match-policy", config)
  }

  async getPersonalInfo(): Promise<PersonalInfo> {
    return this.getUserConfig<PersonalInfo>("personal-info")
  }

  async updatePersonalInfo(updates: Partial<PersonalInfo>): Promise<PersonalInfo> {
    const existing = await this.getPersonalInfo()
    const payload: PersonalInfo = {
      ...existing,
      ...updates,
      email: updates.email ?? existing.email ?? "",
    }
    await this.upsertUserConfig("personal-info", payload)
    return payload
  }
}

export const userConfigClient = new UserConfigClient()
