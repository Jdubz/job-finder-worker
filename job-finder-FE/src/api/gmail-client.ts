import { BaseApiClient } from "./base-client"
import { API_CONFIG } from "@/config/api"
import type { ApiSuccessResponse, ApplicationEmail } from "@shared/types"

export interface GmailAccountInfo {
  userEmail: string
  gmailEmail: string
  updatedAt: string
  hasRefreshToken: boolean
  expiryDate?: number
  scopes?: string[]
  historyId?: string
}

export interface TrackerScanResult {
  gmailEmail: string
  emailsProcessed: number
  emailsLinked: number
  statusChanges: number
  errors: string[]
}

export class GmailClient extends BaseApiClient {
  constructor(baseUrl: string | (() => string) = () => API_CONFIG.baseUrl) {
    super(baseUrl)
  }

  async exchangeOAuthCode(params: {
    code: string
    redirectUri: string
    userEmail: string
    gmailEmail?: string
  }) {
    const response = await this.post<
      ApiSuccessResponse<{ stored: boolean; gmailEmail: string; userEmail: string; scopes?: string[] }>
    >("/gmail/oauth/exchange", params)
    return "data" in response ? response.data : response
  }

  async listAccounts(): Promise<GmailAccountInfo[]> {
    const response = await this.get<ApiSuccessResponse<{ accounts: GmailAccountInfo[] }>>(
      "/gmail/accounts"
    )
    const payload = "data" in response ? response.data : (response as { accounts: GmailAccountInfo[] })
    return payload.accounts ?? []
  }

  async revokeAccount(gmailEmail: string) {
    const response = await this.post<ApiSuccessResponse<{ revoked: boolean; gmailEmail: string }>>(
      `/gmail/accounts/${encodeURIComponent(gmailEmail)}/revoke`
    )
    return "data" in response ? response.data : response
  }

  async triggerScan(): Promise<TrackerScanResult[]> {
    const response = await this.post<ApiSuccessResponse<{ results: TrackerScanResult[] }>>(
      "/gmail/tracker/scan",
      {}
    )
    const payload = "data" in response ? response.data : (response as { results: TrackerScanResult[] })
    return payload.results ?? []
  }

  async listEmails(options?: { limit?: number; offset?: number }): Promise<ApplicationEmail[]> {
    const params = new URLSearchParams()
    if (options?.limit) params.set("limit", String(options.limit))
    if (options?.offset) params.set("offset", String(options.offset))
    const qs = params.toString()
    const response = await this.get<ApiSuccessResponse<{ emails: ApplicationEmail[] }>>(
      `/gmail/tracker/emails${qs ? `?${qs}` : ""}`
    )
    const payload = "data" in response ? response.data : (response as { emails: ApplicationEmail[] })
    return payload.emails ?? []
  }

  async listUnlinkedEmails(): Promise<ApplicationEmail[]> {
    const response = await this.get<ApiSuccessResponse<{ emails: ApplicationEmail[] }>>(
      "/gmail/tracker/emails/unlinked"
    )
    const payload = "data" in response ? response.data : (response as { emails: ApplicationEmail[] })
    return payload.emails ?? []
  }

  async linkEmail(emailId: string, matchId: string): Promise<ApplicationEmail> {
    const response = await this.post<ApiSuccessResponse<{ email: ApplicationEmail }>>(
      `/gmail/tracker/emails/${emailId}/link`,
      { matchId }
    )
    const payload = "data" in response ? response.data : (response as { email: ApplicationEmail })
    return payload.email
  }

  async unlinkEmail(emailId: string): Promise<ApplicationEmail> {
    const response = await this.post<ApiSuccessResponse<{ email: ApplicationEmail }>>(
      `/gmail/tracker/emails/${emailId}/unlink`
    )
    const payload = "data" in response ? response.data : (response as { email: ApplicationEmail })
    return payload.email
  }
}

export const gmailClient = new GmailClient()
