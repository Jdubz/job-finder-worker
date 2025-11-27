import { BaseApiClient } from "./base-client"
import { API_CONFIG } from "@/config/api"

export interface SessionUserPayload {
  uid: string
  email: string
  emailVerified: boolean
  name?: string
  picture?: string
  roles?: string[]
}

export interface SessionResponse {
  user: SessionUserPayload
}

class AuthClient extends BaseApiClient {
  async fetchSession(): Promise<SessionResponse> {
    return this.get<SessionResponse>("/auth/session", { retryAttempts: 1 })
  }

  async logout(): Promise<{ loggedOut: boolean }> {
    return this.post<{ loggedOut: boolean }>("/auth/logout", undefined, { retryAttempts: 1 })
  }
}

export const authClient = new AuthClient(API_CONFIG.baseUrl, {
  timeout: API_CONFIG.timeout,
  // Auth restoration should survive brief API restarts during deploys.
  retryAttempts: 3,
  retryDelay: 400,
})
