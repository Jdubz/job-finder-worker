import { GmailAuthService, type GmailTokenPayload } from "./gmail-auth.service"
import { refreshAccessToken } from "./gmail-oauth"
import { logger } from "../../logger"
import { ConfigRepository } from "../config/config.repository"
import { JobQueueService } from "../job-queue/job-queue.service"
import type { SubmitJobInput } from "../job-queue/job-queue.service"
import type { GmailIngestConfig } from "./gmail.types"
import { parseEmailBody, parseEmailBodyWithAiFallback } from "./gmail-message-parser"
import { EmailIngestStateRepository } from "./email-ingest-state.repository"

export type IngestJobResult = {
  gmailEmail: string
  jobsFound: number
  jobsQueued: number
  error?: string
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
  private readonly ingestState = new EmailIngestStateRepository()
  private readonly defaultAllowedDomains = [
    "greenhouse.io",
    "lever.co",
    "ashbyhq.com",
    "workday.com",
    "smartrecruiters.com",
    "jobs.ashbyhq.com",
    "boards.greenhouse.io",
    "boards.eu.greenhouse.io",
    "myworkdayjobs.com",
    "jobs.lever.co",
    "wellfound.com",
    "angel.co",
    "recruitee.com",
    "jobvite.com",
    "breezy.hr"
  ]

  async ingestAll(): Promise<IngestJobResult[]> {
    const settings = this.getSettings()
    if (!settings) {
      throw new Error("gmail-ingest config missing")
    }
    if (settings.enabled === false) {
      throw new Error("gmail-ingest disabled")
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

  private getSettings(): GmailIngestConfig | null {
    const cfg = this.config.get<GmailIngestConfig>("gmail-ingest")
    return cfg?.payload ?? null
  }

  private resolveAllowedDomains(settings: GmailIngestConfig): string[] {
    const configured = settings.allowedDomains?.map((d) => d.toLowerCase().trim()).filter(Boolean)
    if (configured && configured.length > 0) return configured
    return this.defaultAllowedDomains
  }

  private async ingestAccount(
    gmailEmail: string,
    tokens: GmailTokenPayload,
    settings: GmailIngestConfig | null
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
    const allowedDomains = this.resolveAllowedDomains(settings)
    const messages = await this.fetchMessages(accessToken, ensured.historyId, q || undefined, maxResults)
    if (!messages.items.length) {
      return { gmailEmail, jobsFound: 0, jobsQueued: 0 }
    }
    let jobsFound = 0
    let jobsQueued = 0

    const fullMessages = await this.fetchFullMessages(accessToken, messages.items)

    for (const full of fullMessages) {
      // Skip already-processed messages using the state table
      if (this.ingestState.isMessageProcessed(full.id)) {
        logger.debug({ messageId: full.id }, "Skipping already-processed Gmail message")
        continue
      }

      const sender = this.getHeader(full, "From")
      if (settings?.allowedSenders?.length) {
        const allowed = settings.allowedSenders.some((s) => sender?.toLowerCase().includes(s.toLowerCase()))
        if (!allowed) {
          // Record as processed with 0 jobs (filtered by sender)
          this.ingestState.recordProcessed({
            messageId: full.id,
            threadId: full.threadId,
            gmailEmail,
            historyId: full.historyId,
            jobsFound: 0,
            jobsEnqueued: 0
          })
          continue
        }
      }

      const body = this.extractBody(full)
      const links = this.extractLinks(body, allowedDomains)

      if (!links.length) {
        // Record as processed with 0 jobs (no links found)
        this.ingestState.recordProcessed({
          messageId: full.id,
          threadId: full.threadId,
          gmailEmail,
          historyId: full.historyId,
          jobsFound: 0,
          jobsEnqueued: 0
        })
        continue
      }

      const parsedJobs = settings.aiFallbackEnabled
        ? await parseEmailBodyWithAiFallback(body, links, { aiFallbackEnabled: true })
        : parseEmailBody(body, links)
      const messageJobsFound = parsedJobs.length
      let messageJobsQueued = 0

      jobsFound += messageJobsFound

      for (const job of parsedJobs) {
        const jobInput: SubmitJobInput = {
          url: job.url,
          source: "email",
          title: job.title,
          companyName: job.company,
          description: job.description,
          metadata: {
            gmailMessageId: full.id,
            gmailThreadId: full.threadId,
            gmailFrom: sender,
            gmailSnippet: full.snippet,
            gmailEmail,
            remoteSourceDefault: settings.remoteSourceDefault ?? false
          }
        }
        try {
          this.queue.submitJob(jobInput)
          messageJobsQueued += 1
          jobsQueued += 1
        } catch (error) {
          const msgErr = error instanceof Error ? error.message : String(error)
          logger.debug({ url: job.url, error: msgErr }, "Failed to enqueue job from Gmail link")
        }
      }

      // Record message as processed with stats
      this.ingestState.recordProcessed({
        messageId: full.id,
        threadId: full.threadId,
        gmailEmail,
        historyId: full.historyId,
        jobsFound: messageJobsFound,
        jobsEnqueued: messageJobsQueued
      })
    }

    // Persist latest historyId to reduce future scans (best-effort)
    if (messages.latestHistoryId) {
      this.auth.saveHistoryId(gmailEmail, String(messages.latestHistoryId))
    }

    return { gmailEmail, jobsFound, jobsQueued }
  }

  getLastSyncTime(gmailEmail?: string): string | null {
    return this.ingestState.getLastSyncTime(gmailEmail)
  }

  getStats(gmailEmail?: string) {
    return this.ingestState.getStats(gmailEmail)
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

  private async fetchMessages(
    accessToken: string,
    historyId?: string,
    q?: string,
    maxResults: number = 25
  ): Promise<{ items: Array<{ id: string; threadId: string; historyId?: string }>; latestHistoryId?: number }> {
    // Prefer history API when we have a checkpoint
    if (historyId) {
      try {
        const hist = await this.listHistory(accessToken, historyId, maxResults)
        if (hist.items.length > 0) {
          return hist
        }
      } catch (error) {
        logger.warn({ error: String(error), historyId }, "History API failed; falling back to message list")
      }
    }

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
    const json = (await res.json()) as { messages?: Array<{ id: string; threadId: string }>; resultSizeEstimate?: number }
    return { items: json.messages ?? [], latestHistoryId: undefined }
  }

  private async fetchFullMessages(accessToken: string, items: Array<{ id: string; threadId: string }>): Promise<GmailMessage[]> {
    const messages: GmailMessage[] = []
    const concurrency = 8
    for (let i = 0; i < items.length; i += concurrency) {
      const batch = items.slice(i, i + concurrency)
      const resolved = await Promise.all(batch.map((m) => this.getMessage(accessToken, m.id)))
      messages.push(...resolved)
    }
    return messages
  }

  private async listHistory(
    accessToken: string,
    startHistoryId: string,
    maxResults: number
  ): Promise<{ items: Array<{ id: string; threadId: string; historyId?: string }>; latestHistoryId?: number }> {
    const params = new URLSearchParams({
      startHistoryId,
      historyTypes: "messageAdded",
      maxResults: String(maxResults)
    })
    const url = `https://gmail.googleapis.com/gmail/v1/users/me/history?${params.toString()}`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Gmail history failed: ${res.status} ${text}`)
    }
    const json = (await res.json()) as {
      history?: Array<{ id?: string; messagesAdded?: Array<{ message?: { id: string; threadId: string } }> }>
      historyId?: string
      nextPageToken?: string
    }

    const items: Array<{ id: string; threadId: string; historyId?: string }> = []
    let latest = json.historyId ? Number(json.historyId) : undefined

    const history = json.history ?? []
    for (const h of history) {
      if (h.id) {
        const idNum = Number(h.id)
        if (!Number.isNaN(idNum) && (latest === undefined || idNum > latest)) latest = idNum
      }
      const added = h.messagesAdded ?? []
      for (const ma of added) {
        if (ma.message?.id && ma.message.threadId) {
          items.push({ id: ma.message.id, threadId: ma.message.threadId, historyId: h.id })
        }
      }
    }

    // Pagination not implemented for brevity; maxResults keeps batches small.
    return { items, latestHistoryId: latest }
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

  private extractLinks(text: string, allowedDomains: string[]): string[] {
    if (!text) return []
    const regex = /https?:\/\/[^\s"'>)]+/gi
    const found = text.match(regex) ?? []
    const cleaned = found
      .map((url) => url.replace(/[.,;]+$/, ""))
      .filter((url) => this.isLikelyJobLink(url, allowedDomains))

    // dedupe
    return Array.from(new Set(cleaned))
  }

  private isLikelyJobLink(url: string, allowedDomains: string[]): boolean {
    try {
      const parsed = new URL(url)
      const host = parsed.hostname.toLowerCase()
      const path = (parsed.pathname || "").toLowerCase()
      const domainAllowed =
        allowedDomains.some((d) => host === d || host.endsWith(`.${d}`)) ||
        path.includes("/careers") ||
        path.includes("/jobs")
      return domainAllowed
    } catch {
      return false
    }
  }

  private getHeader(msg: GmailMessage, name: string): string | undefined {
    const headers = msg.payload?.headers || []
    const match = headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())
    return match?.value
  }
}
