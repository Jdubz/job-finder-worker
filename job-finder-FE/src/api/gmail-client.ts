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
    return response.data
  }

  async listAccounts(): Promise<GmailAccountInfo[]> {
    const response = await this.get<ApiSuccessResponse<{ accounts: GmailAccountInfo[] }>>(
      "/gmail/accounts"
    )
    return response.data.accounts ?? []
  }

  async revokeAccount(gmailEmail: string) {
    const response = await this.post<ApiSuccessResponse<{ revoked: boolean; gmailEmail: string }>>(
      `/gmail/accounts/${encodeURIComponent(gmailEmail)}/revoke`
    )
    return response.data
  }

  async triggerScan(options?: { days?: number }): Promise<TrackerScanResult[]> {
    const response = await this.post<ApiSuccessResponse<{ results: TrackerScanResult[] }>>(
      "/gmail/tracker/scan",
      options ?? {},
      { timeout: 5 * 60 * 1000 }
    )
    return response.data.results ?? []
  }

  async listEmails(options?: { limit?: number; offset?: number }): Promise<ApplicationEmail[]> {
    const params = new URLSearchParams()
    if (options?.limit) params.set("limit", String(options.limit))
    if (options?.offset) params.set("offset", String(options.offset))
    const qs = params.toString()
    const response = await this.get<ApiSuccessResponse<{ emails: ApplicationEmail[] }>>(
      `/gmail/tracker/emails${qs ? `?${qs}` : ""}`
    )
    return response.data.emails ?? []
  }

  async listUnlinkedEmails(): Promise<ApplicationEmail[]> {
    const response = await this.get<ApiSuccessResponse<{ emails: ApplicationEmail[] }>>(
      "/gmail/tracker/emails/unlinked"
    )
    return response.data.emails ?? []
  }

  async linkEmail(emailId: string, matchId: string): Promise<ApplicationEmail> {
    const response = await this.post<ApiSuccessResponse<{ email: ApplicationEmail }>>(
      `/gmail/tracker/emails/${emailId}/link`,
      { matchId }
    )
    return response.data.email
  }

  async unlinkEmail(emailId: string): Promise<ApplicationEmail> {
    const response = await this.post<ApiSuccessResponse<{ email: ApplicationEmail }>>(
      `/gmail/tracker/emails/${emailId}/unlink`
    )
    return response.data.email
  }
}

export const gmailClient = new GmailClient()
