import { GmailAuthService, type GmailTokenPayload } from "./gmail-auth.service"
import { refreshAccessToken } from "./gmail-oauth"
import { logger } from "../../logger"
import { ConfigRepository } from "../config/config.repository"
import { JobQueueService } from "../job-queue/job-queue.service"
import type { SubmitJobInput } from "../job-queue/job-queue.service"
import type { GmailIngestConfig } from "./gmail.types"
import { parseEmailBody, parseEmailBodyWithAiFallback } from "./gmail-message-parser"
import { EmailIngestStateRepository } from "./email-ingest-state.repository"
import zlib from "zlib"

export type IngestJobResult = {
  gmailEmail: string
  jobsFound: number
  jobsQueued: number
  error?: string
}

type JobCandidate = {
  url: string
  title?: string
  company?: string
  location?: string
  locationWorkType?: "remote" | "hybrid" | "onsite"
  salary?: string
  description?: string
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
  private maxLinksPerMessage = 30
  private maxResolvedLinksPerRun = 60
  private readonly resolveTimeoutMs = 4500
  private readonly maxRedirectHops = 5
  private readonly trackerHosts = ["cts.indeed.com", "trk.", "click."]

  // Domains that strongly suggest job content (ATS / boards)
  private readonly jobLinkHints = [
    "greenhouse.io",
    "lever.co",
    "workday",
    "ashbyhq.com",
    "smartrecruiters",
    "breezy.hr",
    "jobs.ashbyhq.com",
    "boards.greenhouse.io",
    "jobs.lever.co",
    "wellfound.com",
    "builtin.com",
    "indeed.com/viewjob",
    "linkedin.com/jobs",
    "ziprecruiter",
    "monster.com",
    "themuse.com",
    "hitmarker",
    "myworkdayjobs",
    "icims.com",
    "recruiting",
    "workable.com",
    "jobvite.com",
    "indeed.com",
    "simplify.jobs",
    "ripplematch.com",
    "himalayas.app",
    "wellfound.com/jobs"
  ]

  // Known senders of job digests
  private readonly jobSenderHints = ["indeed.com", "linkedin.com", "you.com", "ziprecruiter.com", "wellfound.com", "builtin.com"]

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
    if (!cfg?.payload) return null
    // Apply defaults for new fields so legacy configs continue to work
    return {
      maxAgeDays: cfg.payload.maxAgeDays ?? 7,
      maxMessages: cfg.payload.maxMessages ?? 50,
      label: cfg.payload.label,
      enabled: cfg.payload.enabled ?? false,
      remoteSourceDefault: cfg.payload.remoteSourceDefault,
      aiFallbackEnabled: cfg.payload.aiFallbackEnabled,
      defaultLabelOwner: cfg.payload.defaultLabelOwner,
      // legacy fields passthrough but unused now
      ...(cfg.payload as any),
    }
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
    if (settings?.maxAgeDays) queryParts.push(`newer_than:${settings.maxAgeDays}d`)
    const q = queryParts.join(" ").trim()
    const maxResults = settings?.maxMessages ?? 50
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
      const subject = this.getHeader(full, "Subject")
      const body = this.extractBody(full)

      if (!this.isJobRelated(subject, body, sender)) {
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

      const rawLinks = this.extractLinks(body)
      const resolvedLinks = await this.resolveLinksLimited(rawLinks)
      const linkList = resolvedLinks.length ? resolvedLinks.map((l) => l.resolved ?? l.original) : rawLinks

      const jobLinks = linkList
        .filter((url) => this.isLikelyJobLink(url, true))
        .filter((url) => !this.isObviousAsset(url))
        .filter((url) => !this.isTrackerHost(url))

      // If no usable job links, try to extract companies and enqueue company discoveries
      if (!jobLinks.length) {
        const companies = settings.aiFallbackEnabled ? await this.extractCompanies(subject, body) : this.extractCompaniesHeuristic(subject, body)
        let companyQueued = 0
        for (const companyName of companies) {
          try {
            this.queue.submitCompany({ companyName, source: "email" })
            companyQueued += 1
            jobsQueued += 0 // company submissions not counted as jobs
          } catch (error) {
            logger.debug({ companyName, error: String(error) }, "Failed to enqueue company from Gmail body")
          }
        }
        this.ingestState.recordProcessed({
          messageId: full.id,
          threadId: full.threadId,
          gmailEmail,
          historyId: full.historyId,
          jobsFound: 0,
          jobsEnqueued: companyQueued
        })
        continue
      }

      const parsedJobs = await this.parseEmailForJobs(subject, body, jobLinks, settings.aiFallbackEnabled)
      const messageJobsFound = parsedJobs.length
      let messageJobsQueued = 0

      jobsFound += messageJobsFound

      for (const job of parsedJobs) {
        const manualLocation =
          job.location && job.locationWorkType
            ? `${job.location} (${job.locationWorkType})`
            : job.location ?? (job.locationWorkType ? job.locationWorkType : undefined)

        const jobInput: SubmitJobInput = {
          url: job.url,
          source: "email",
          title: job.title,
          companyName: job.company,
          description: job.description,
          location: manualLocation,
          metadata: {
            gmailMessageId: full.id,
            gmailThreadId: full.threadId,
            gmailFrom: sender,
            gmailSubject: subject,
            gmailSnippet: full.snippet,
            gmailEmail,
            remoteSourceDefault: settings.remoteSourceDefault ?? false,
            gmailParsedLocation: job.location,
            gmailWorkType: job.locationWorkType,
            gmailSalaryHint: job.salary
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

  private extractLinks(text: string): string[] {
    if (!text) return []
    const regex = /https?:\/\/[^\s"'>)]+/gi
    const found = text.match(regex) ?? []
    const cleaned = found
      .map((url) => url.replace(/[.,;]+$/, ""))
      .filter((url) => this.isLikelyJobLink(url))

    // dedupe
    return Array.from(new Set(cleaned)).slice(0, this.maxLinksPerMessage)
  }

  private isLikelyJobLink(url: string, strict = false): boolean {
    const lower = url.toLowerCase()
    // Drop obvious non-job or footers
    if (lower.includes("unsubscribe") || lower.includes("/privacy") || lower.includes("/settings")) return false
    if (this.isObviousAsset(url)) return false
    if (strict) {
      return this.jobLinkHints.some((hint) => lower.includes(hint))
    }
    // Prefer keeping most links to widen intake; only minimal filtering above
    return true
  }

  private isObviousAsset(url: string): boolean {
    const lower = url.toLowerCase()
    if (lower.endsWith(".png") || lower.endsWith(".jpg") || lower.endsWith(".gif") || lower.endsWith(".css") || lower.endsWith(".woff") || lower.endsWith(".woff2")) return true
    if (lower.includes("fonts.googleapis") || lower.includes("statics.indeed.com") || lower.includes("gstatic.com")) return true
    return false
  }

  private isJobRelated(subject?: string, body?: string, from?: string): boolean {
    const haystack = `${subject ?? ""}\n${body ?? ""}`.toLowerCase()
    const keywords = [
      "job", "role", "opening", "position", "hiring", "opportunity", "match", "application", "applied",
      "interview", "recruit", "careers", "offer", "head hunter", "headhunter"
    ]
    const atsDomains = this.jobLinkHints
    if (keywords.some((k) => haystack.includes(k))) return true
    const senderDomain = from?.split("@")[1]?.toLowerCase()
    if (senderDomain && this.jobSenderHints.some((d) => senderDomain.endsWith(d))) return true
    if (keywords.some((k) => haystack.includes(k))) return true
    return atsDomains.some((d) => haystack.includes(d))
  }

  private async parseEmailForJobs(
    subject: string | undefined,
    body: string,
    links: string[],
    aiFallbackEnabled?: boolean
  ): Promise<JobCandidate[]> {
    // Extract basic fields from subject/body
    const parsedSubject = this.parseSubject(subject)
    const salary = this.findSalary(body)
    const location = this.findLocation(body)
    const remoteFlag = this.findRemoteFlag(body)

    // Start with URL-only jobs
    const baseJobs = links.map((url) => ({
      url,
      title: parsedSubject?.title,
      company: parsedSubject?.company,
      location: location?.cityState,
      locationWorkType: remoteFlag,
      salary,
      description: undefined as string | undefined
    }))

    // No AI enrichment for now; keep payload minimal
    return baseJobs
  }

  private parseSubject(subject?: string): { title?: string; company?: string } | null {
    if (!subject) return null
    const m = subject.match(/(.+?)\s+@\s+(.+)/)
    if (m) {
      return { title: m[1].trim(), company: m[2].trim() }
    }
    return { title: subject.trim() }
  }

  private findSalary(text: string): string | undefined {
    const m = text.match(/\$[0-9][^\s]*\s*-\s*\$[0-9][^\s]*/)
    return m ? m[0] : undefined
  }

  private findRemoteFlag(text: string): "remote" | "hybrid" | "onsite" | undefined {
    const lower = text.toLowerCase()
    if (lower.includes("remote")) return "remote"
    if (lower.includes("hybrid")) return "hybrid"
    if (lower.includes("onsite") || lower.includes("on-site")) return "onsite"
    return undefined
  }

  private findLocation(text: string): { cityState?: string } | null {
    const m = text.match(/([A-Z][a-zA-Z]+),\s*([A-Z]{2})/) // City, ST
    if (m) return { cityState: `${m[1]}, ${m[2]}` }
    return null
  }

  private async resolveLinksLimited(urls: string[]): Promise<Array<{ original: string; resolved?: string }>> {
    if (!urls.length) return []
    const limited = urls.slice(0, this.maxResolvedLinksPerRun)
    const resolved: Array<{ original: string; resolved?: string }> = []
    for (const url of limited) {
      if (resolved.length >= this.maxResolvedLinksPerRun) break
      try {
        const finalUrl = await this.resolveOne(url)
        resolved.push({ original: url, resolved: finalUrl })
      } catch {
        resolved.push({ original: url })
      }
    }
    return resolved
  }

  private async resolveOne(url: string): Promise<string> {
    // Try direct decode for known tracker formats
    const decoded = this.decodeTracker(url)
    if (decoded) return decoded

    // For known trackers, try a single "follow" request first to get final URL
    if (this.isTrackerHost(url)) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), this.resolveTimeoutMs * 2)
      try {
        const res = await fetch(url, {
          method: "GET",
          redirect: "follow",
          signal: controller.signal,
          headers: { "User-Agent": "Mozilla/5.0 (JobFinder Gmail Intake)" }
        })
        clearTimeout(timer)
        if (res.body && res.body.cancel) {
          try {
            res.body.cancel()
          } catch {}
        }
        if (res.url) return res.url
      } catch {
        clearTimeout(timer)
      }
    }

    let current = url
    const maxHops = this.maxRedirectHops
    for (let hop = 0; hop < maxHops; hop++) {
      const controller = new AbortController()
      const hopTimeout = this.isTrackerHost(current) ? this.resolveTimeoutMs * 2 : this.resolveTimeoutMs
      const timer = setTimeout(() => controller.abort(), hopTimeout)
      try {
        const res = await fetch(current, { method: "GET", redirect: "manual", signal: controller.signal })
        clearTimeout(timer)
        const loc = res.headers.get("location")
        const finalUrl = res.url || current
        // Stop downloading body ASAP to limit bandwidth
        if (res.body && res.body.cancel) {
          try {
            res.body.cancel()
          } catch {}
        }
        if (loc && res.status >= 300 && res.status < 400) {
          // follow redirect
          const next = new URL(loc, finalUrl).toString()
          current = next
          continue
        }
        return finalUrl
      } catch {
        clearTimeout(timer)
        return current
      }
    }
    return current
  }

  private isTrackerHost(url: string): boolean {
    try {
      const host = new URL(url).hostname.toLowerCase()
      return this.trackerHosts.some((h) => host.includes(h))
    } catch {
      return false
    }
  }

  private async extractCompanies(subject?: string, body?: string): Promise<string[]> {
    const companies = new Set<string>()
    const heuristic = this.extractCompaniesHeuristic(subject, body)
    heuristic.forEach((c) => companies.add(c))
    try {
      const enriched = await parseEmailBodyWithAiFallback(body ?? "", [], { aiFallbackEnabled: true })
      enriched
        .map((j) => j.company)
        .filter((c): c is string => Boolean(c))
        .forEach((c) => companies.add(c))
    } catch (error) {
      logger.debug({ error: String(error) }, "AI company extraction failed; falling back to heuristic")
    }
    return Array.from(companies).slice(0, 10)
  }

  private extractCompaniesHeuristic(subject?: string, body?: string): string[] {
    const found = new Set<string>()
    const add = (s?: string) => {
      if (!s) return
      const clean = s.replace(/[^a-zA-Z0-9 .,&-]/g, "").trim()
      if (clean.length > 1 && clean.length < 80) found.add(clean)
    }

    // From subject patterns: "Role @ Company" or "Role at Company"
    if (subject) {
      const atMatch = subject.match(/@\\s*([^@]+)$/) || subject.match(/\\bat\\s+([^@]+)$/i)
      if (atMatch) add(atMatch[1])
    }

    if (body) {
      const lines = body.split(/\\n+/).slice(0, 80)
      for (const line of lines) {
        const m = line.match(/at\\s+([A-Z][A-Za-z0-9 .,&'-]{2,60})/)
        if (m) add(m[1])
        const m2 = line.match(/with\\s+([A-Z][A-Za-z0-9 .,&'-]{2,60})/)
        if (m2) add(m2[1])
      }
    }

    return Array.from(found).slice(0, 10)
  }

  private decodeTracker(url: string): string | null {
    try {
      const parsed = new URL(url)
      if (parsed.hostname.includes("cts.indeed.com")) {
        const token = parsed.pathname.split("/").pop()
        if (token) {
          try {
            const buf = Buffer.from(token, "base64")
            const inflated = zlib.gunzipSync(buf).toString("utf8")
            if (inflated.startsWith("http")) {
              return inflated
            }
          } catch {
            return null
          }
        }
      }
    } catch {
      return null
    }
    return null
  }

  private getHeader(msg: GmailMessage, name: string): string | undefined {
    const headers = msg.payload?.headers || []
    const match = headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())
    return match?.value
  }
}
