import { GmailAuthService, type GmailTokenPayload } from "./gmail-auth.service"
import { refreshAccessToken } from "./gmail-oauth"
import { logger } from "../../logger"
import { ConfigRepository } from "../config/config.repository"
import { JobQueueService } from "../job-queue/job-queue.service"
import type { SubmitJobInput } from "../job-queue/job-queue.service"

export type IngestJobResult = {
  gmailEmail: string
  jobsFound: number
  jobsQueued: number
  error?: string
}

type GmailIngestSettings = {
  enabled?: boolean
  label?: string
  query?: string
  maxMessages?: number
  allowedSenders?: string[]
  remoteSourceDefault?: boolean
  aiFallbackEnabled?: boolean
}

type GmailMessage = {
  id: string
  threadId: string
  payload?: {
    headers?: Array<{ name: string; value: string }>
    body?: { size?: number; data?: string }
    parts?: GmailPart[]
  }
  snippet?: string
  historyId?: string
}

type GmailPart = {
  mimeType?: string
  filename?: string
  body?: { size?: number; data?: string }
  parts?: GmailPart[]
}

export class GmailIngestService {
  private readonly auth = new GmailAuthService()
  private readonly config = new ConfigRepository()
  private readonly queue = new JobQueueService()

  async ingestAll(): Promise<IngestJobResult[]> {
    const settings = this.getSettings()
    if (settings && settings.enabled === false) {
      logger.info("Gmail ingest disabled; skipping")
      return []
    }

    const accounts = this.auth.listAccounts()
    const results: IngestJobResult[] = []
    for (const acct of accounts) {
      try {
        const tokens = this.auth.getTokensForGmailEmail(acct.gmailEmail)
        if (!tokens) {
          results.push({ gmailEmail: acct.gmailEmail, jobsFound: 0, jobsQueued: 0, error: "missing tokens" })
          continue
        }
        const result = await this.ingestAccount(acct.gmailEmail, tokens, settings)
        results.push(result)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        logger.error({ gmailEmail: acct.gmailEmail, error: message }, "Gmail ingest failed")
        results.push({ gmailEmail: acct.gmailEmail, jobsFound: 0, jobsQueued: 0, error: message })
      }
    }
    return results
  }

  private getSettings(): GmailIngestSettings | null {
    const cfg = this.config.get<GmailIngestSettings>("gmail-ingest")
    return cfg?.payload ?? null
  }

  private async ingestAccount(
    gmailEmail: string,
    tokens: GmailTokenPayload,
    settings: GmailIngestSettings | null
  ): Promise<IngestJobResult> {
    if (!settings) {
      throw new Error("gmail-ingest config missing")
    }
    if (!settings.enabled) {
      throw new Error("gmail-ingest disabled")
    }

    const ensured = await this.ensureAccessToken(tokens)
    const accessToken = ensured.access_token
    if (!accessToken) {
      throw new Error("No access token after refresh")
    }

    const queryParts: string[] = []
    if (settings?.label) queryParts.push(`label:${settings.label}`)
    if (settings?.query) queryParts.push(settings.query)
    const q = queryParts.join(" ").trim()
    const maxResults = settings?.maxMessages ?? 25

    const messages = await this.listMessages(accessToken, q || undefined, maxResults)
    let jobsFound = 0
    let jobsQueued = 0

    for (const msg of messages) {
      const full = await this.getMessage(accessToken, msg.id)
      const sender = this.getHeader(full, "From")
      if (settings?.allowedSenders?.length) {
        const allowed = settings.allowedSenders.some((s) => sender?.toLowerCase().includes(s.toLowerCase()))
        if (!allowed) continue
      }
      const body = this.extractBody(full)
      const links = this.extractLinks(body)
      jobsFound += links.length

      for (const url of links) {
        const jobInput: SubmitJobInput = {
          url,
          source: "email",
          metadata: {
            gmailMessageId: full.id,
            gmailThreadId: full.threadId,
            gmailFrom: sender,
            gmailSnippet: full.snippet,
            gmailEmail
          }
        }
        try {
          this.queue.submitJob(jobInput)
          jobsQueued += 1
        } catch (error) {
          const msgErr = error instanceof Error ? error.message : String(error)
          logger.debug({ url, error: msgErr }, "Failed to enqueue job from Gmail link")
        }
      }
    }

    return { gmailEmail, jobsFound, jobsQueued }
  }

  private async ensureAccessToken(tokens: GmailTokenPayload) {
    if (tokens.access_token && tokens.expiry_date && tokens.expiry_date > Date.now() + 60_000) {
      return tokens
    }
    const refreshed = await refreshAccessToken(tokens.refresh_token)
    return {
      ...tokens,
      access_token: refreshed.access_token,
      expiry_date: Date.now() + refreshed.expires_in * 1000,
      scope: refreshed.scope,
      token_type: refreshed.token_type
    }
  }

  private async listMessages(
    accessToken: string,
    q?: string,
    maxResults: number = 25
  ): Promise<Array<{ id: string; threadId: string }>> {
    const params = new URLSearchParams({ maxResults: String(maxResults), includeSpamTrash: "false" })
    if (q) params.set("q", q)
    const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params.toString()}`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Gmail list failed: ${res.status} ${text}`)
    }
    const json = (await res.json()) as { messages?: Array<{ id: string; threadId: string }> }
    return json.messages ?? []
  }

  private async getMessage(accessToken: string, id: string): Promise<GmailMessage> {
    const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Gmail get failed: ${res.status} ${text}`)
    }
    return (await res.json()) as GmailMessage
  }

  private extractBody(msg: GmailMessage): string {
    const buffers: string[] = []

    const walk = (p: GmailPart | undefined) => {
      if (!p) return
      const mime = (p.mimeType || "").toLowerCase()
      if (mime === "text/plain" || mime === "text/html" || !p.mimeType) {
        const data = p.body?.data
        if (data) {
          buffers.push(this.decodeBase64Url(data))
        }
      }
      if (p.parts) p.parts.forEach(walk)
    }

    if (msg.payload) walk(msg.payload as GmailPart)
    if (buffers.length === 0 && msg.snippet) buffers.push(msg.snippet)
    return buffers.join("\n")
  }

  private decodeBase64Url(data: string): string {
    const normalized = data.replace(/-/g, "+").replace(/_/g, "/")
    const buf = Buffer.from(normalized, "base64")
    return buf.toString("utf8")
  }

  private extractLinks(text: string): string[] {
    if (!text) return []
    const regex = /https?:\/\/[^\s"'>)]+/gi
    const found = text.match(regex) ?? []
    const cleaned = found.map((url) => url.replace(/[.,;]+$/, ""))
    // dedupe
    return Array.from(new Set(cleaned))
  }

  private getHeader(msg: GmailMessage, name: string): string | undefined {
    const headers = msg.payload?.headers || []
    const match = headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())
    return match?.value
  }
}
