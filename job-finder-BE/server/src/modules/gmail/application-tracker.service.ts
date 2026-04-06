import { GmailAuthService, type GmailTokenPayload } from "./gmail-auth.service"
import {
  ensureAccessToken,
  fetchMessageList,
  fetchFullMessages,
  extractBody,
  getHeader,
  extractSenderDomain
} from "./gmail-api"
import { classifyEmail } from "./email-classifier"
import {
  matchEmailToApplications,
  extractDomainFromUrl,
  normalizeCompanyName,
  validateDomainForCompany,
  ATS_DOMAINS,
  type ParsedEmail
} from "./email-application-matcher"
import { ApplicationEmailRepository, type CreateApplicationEmailInput } from "./application-email.repository"
import { StatusHistoryRepository } from "./status-history.repository"
import { JobMatchRepository } from "../job-matches/job-match.repository"
import type { JobMatchStatus, JobMatchWithListing, MatchSignals } from "@shared/types"
import { logger } from "../../logger"

/** Statuses that represent an active application (eligible for email matching) */
const ACTIVE_APPLICATION_STATUSES: JobMatchStatus[] = ["applied", "acknowledged", "interviewing"]

/** High confidence threshold for auto-linking and status updates */
const HIGH_CONFIDENCE = 70
/** Medium confidence threshold for linking without status update */
const MEDIUM_CONFIDENCE = 40
/** Confidence assigned when a match is inherited from the same Gmail thread */
const THREAD_INHERITANCE_CONFIDENCE = 85

/** Max active matches to load per status */
const MAX_ACTIVE_MATCHES_PER_STATUS = 500
/** Max messages to fetch per Gmail query */
const MAX_MESSAGES_PER_QUERY = 200
/** Max company domains per Gmail query (URL length safety) */
const COMPANY_QUERY_CHUNK_SIZE = 25
/** Max company names per ATS query */
const ATS_QUERY_CHUNK_SIZE = 10
/** Max Gmail queries to execute concurrently */
const QUERY_CONCURRENCY = 5

export interface TrackerScanResult {
  gmailEmail: string
  emailsProcessed: number
  emailsLinked: number
  statusChanges: number
  errors: string[]
}

export class ApplicationTrackerService {
  private readonly auth = new GmailAuthService()
  private readonly emailRepo = new ApplicationEmailRepository()
  private readonly historyRepo = new StatusHistoryRepository()
  private readonly matchRepo = new JobMatchRepository()

  async scanAll(userEmail?: string, options?: { days?: number }): Promise<TrackerScanResult[]> {
    let accounts = this.auth.listAccounts()
    if (userEmail) {
      accounts = accounts.filter((a) => a.userEmail.toLowerCase() === userEmail.toLowerCase())
    }
    const days = options?.days ?? 14
    const results: TrackerScanResult[] = []

    for (const acct of accounts) {
      try {
        const tokens = this.auth.getTokensForGmailEmail(acct.gmailEmail)
        if (!tokens) {
          results.push({
            gmailEmail: acct.gmailEmail,
            emailsProcessed: 0,
            emailsLinked: 0,
            statusChanges: 0,
            errors: ["missing tokens"]
          })
          continue
        }
        const result = await this.scanAccount(acct.gmailEmail, tokens, days)
        results.push(result)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        logger.error({ gmailEmail: acct.gmailEmail, error: message }, "Application tracker scan failed")
        results.push({
          gmailEmail: acct.gmailEmail,
          emailsProcessed: 0,
          emailsLinked: 0,
          statusChanges: 0,
          errors: [message]
        })
      }
    }

    return results
  }

  private async scanAccount(
    gmailEmail: string,
    tokens: GmailTokenPayload,
    days: number
  ): Promise<TrackerScanResult> {
    const result: TrackerScanResult = {
      gmailEmail,
      emailsProcessed: 0,
      emailsLinked: 0,
      statusChanges: 0,
      errors: []
    }

    const ensured = await ensureAccessToken(tokens)
    if (!ensured.access_token) {
      result.errors.push("No access token after refresh")
      return result
    }

    // Get all active applications for matching
    const appliedMatches = ACTIVE_APPLICATION_STATUSES.flatMap((s) =>
      this.matchRepo.listWithListings({ status: s, limit: MAX_ACTIVE_MATCHES_PER_STATUS })
    )

    if (appliedMatches.length === 0) return result

    // Build targeted queries from active applications
    const queries = this.buildTargetedQueries(appliedMatches, days)
    if (queries.length === 0) return result

    logger.info({ queryCount: queries.length, days }, "Executing targeted Gmail queries")

    // Execute queries with limited concurrency
    const allItems: Array<{ id: string; threadId: string }> = []
    for (let i = 0; i < queries.length; i += QUERY_CONCURRENCY) {
      const batch = queries.slice(i, i + QUERY_CONCURRENCY)
      const batchResults = await Promise.all(
        batch.map((q) =>
          fetchMessageList(ensured.access_token!, q, MAX_MESSAGES_PER_QUERY)
            .then((r) => r.items)
            .catch((err) => {
              logger.warn({ query: q, error: String(err) }, "Gmail query failed, skipping")
              return [] as Array<{ id: string; threadId: string }>
            })
        )
      )
      allItems.push(...batchResults.flat())
    }

    // Deduplicate and pre-filter already-processed messages before expensive full fetch
    const uniqueItems = this.deduplicateMessages(allItems)
    const newItems = uniqueItems.filter((item) => !this.emailRepo.isProcessed(gmailEmail, item.id))

    if (newItems.length === 0) return result

    logger.info({ messageCount: newItems.length }, "Fetching full messages")
    const fullMessages = await fetchFullMessages(ensured.access_token, newItems)

    for (const msg of fullMessages) {
      const sender = getHeader(msg, "From") ?? ""
      const subject = getHeader(msg, "Subject") ?? ""
      const replyTo = getHeader(msg, "Reply-To")
      const dateHeader = getHeader(msg, "Date")
      const body = extractBody(msg)
      const senderDomain = extractSenderDomain(sender)

      result.emailsProcessed++

      const classification = classifyEmail(subject, body, sender)

      // Thread inheritance: if another email in this thread is already linked, inherit that match
      let topCandidate: { jobMatchId: string; confidence: number; signals: MatchSignals } | null = null
      if (msg.threadId) {
        const linkedEmail = this.emailRepo.findLinkedMatchByThreadId(gmailEmail, msg.threadId)
        if (linkedEmail?.jobMatchId) {
          topCandidate = {
            jobMatchId: linkedEmail.jobMatchId,
            confidence: THREAD_INHERITANCE_CONFIDENCE,
            signals: { threadInheritance: true }
          }
        }
      }

      // Standard multi-signal scoring (only if no thread inheritance)
      if (!topCandidate) {
        const parsedEmail: ParsedEmail = {
          sender,
          senderDomain,
          replyTo,
          subject,
          body,
          receivedAt: dateHeader ? new Date(dateHeader) : new Date()
        }
        const candidates = matchEmailToApplications(parsedEmail, appliedMatches)
        topCandidate = candidates[0] ?? null
      }

      // Build the email record
      const emailInput: CreateApplicationEmailInput = {
        gmailMessageId: msg.id,
        gmailThreadId: msg.threadId,
        gmailEmail,
        sender,
        senderDomain,
        subject,
        receivedAt: (dateHeader ? new Date(dateHeader) : new Date()).toISOString(),
        snippet: msg.snippet ?? null,
        bodyPreview: body.slice(0, 500) || null,
        classification: classification.classification,
        classificationConfidence: classification.confidence,
        matchConfidence: topCandidate?.confidence ?? null,
        matchSignals: topCandidate?.signals ?? null,
        autoLinked: false,
        jobMatchId: null
      }

      if (topCandidate && topCandidate.confidence >= HIGH_CONFIDENCE) {
        emailInput.jobMatchId = topCandidate.jobMatchId
        emailInput.autoLinked = true
        result.emailsLinked++

        const appEmail = this.emailRepo.create(emailInput)

        if (classification.classification !== "unclassified") {
          const match = this.matchRepo.getById(topCandidate.jobMatchId)
          if (match && this.shouldUpdateStatus(match.status as JobMatchStatus, classification.classification as JobMatchStatus)) {
            const previousStatus = match.status as JobMatchStatus
            const newStatus = classification.classification as JobMatchStatus
            this.matchRepo.updateStatus(topCandidate.jobMatchId, newStatus, {
              updatedBy: "email_tracker"
            })
            this.historyRepo.record({
              jobMatchId: topCandidate.jobMatchId,
              fromStatus: previousStatus,
              toStatus: newStatus,
              changedBy: "email_tracker",
              applicationEmailId: appEmail.id,
              note: `Auto-detected from email: "${subject}"`
            })
            result.statusChanges++
          }
        }
      } else if (topCandidate && topCandidate.confidence >= MEDIUM_CONFIDENCE) {
        emailInput.jobMatchId = topCandidate.jobMatchId
        emailInput.autoLinked = false
        result.emailsLinked++
        this.emailRepo.create(emailInput)
      } else {
        this.emailRepo.create(emailInput)
      }
    }

    return result
  }

  /**
   * Build targeted Gmail search queries from active job matches.
   *
   * Two query categories:
   * 1. Company-direct: from:(domain1 OR domain2 OR ...) newer_than:Nd
   * 2. ATS: from:(ats1 OR ats2 OR ...) ("Company1" OR "Company2" OR ...) newer_than:Nd
   */
  private buildTargetedQueries(matches: JobMatchWithListing[], days: number): string[] {
    const queries: string[] = []
    const companyDomains = new Set<string>()
    const companyNames = new Set<string>()

    for (const match of matches) {
      const companyName = match.isGhost
        ? match.ghostCompany ?? ""
        : match.listing.companyName
      const companyWebsite = match.isGhost
        ? match.ghostUrl
        : match.company?.website

      const rawDomain = extractDomainFromUrl(companyWebsite)
      const validatedDomain = validateDomainForCompany(rawDomain, companyName)

      if (validatedDomain) {
        companyDomains.add(validatedDomain)
      }

      const normalized = normalizeCompanyName(companyName)
      if (normalized.length >= 3) {
        companyNames.add(companyName)
      }
    }

    const timeSuffix = `newer_than:${days}d`

    // Category 1: Company-direct queries
    const domainArray = [...companyDomains]
    for (let i = 0; i < domainArray.length; i += COMPANY_QUERY_CHUNK_SIZE) {
      const chunk = domainArray.slice(i, i + COMPANY_QUERY_CHUNK_SIZE)
      const fromClause = chunk.join(" OR ")
      queries.push(`from:(${fromClause}) ${timeSuffix}`)
    }

    // Category 2: ATS queries (ATS senders mentioning applied company names)
    const nameArray = [...companyNames]
    if (nameArray.length > 0) {
      const atsFromClause = ATS_DOMAINS.join(" OR ")
      for (let i = 0; i < nameArray.length; i += ATS_QUERY_CHUNK_SIZE) {
        const chunk = nameArray.slice(i, i + ATS_QUERY_CHUNK_SIZE)
        const nameClause = chunk.map((n) => `"${sanitizeQueryTerm(n)}"`).join(" OR ")
        queries.push(`from:(${atsFromClause}) (${nameClause}) ${timeSuffix}`)
      }
    }

    return queries
  }

  /**
   * Deduplicate message stubs by message ID (multiple queries may return the same message).
   */
  private deduplicateMessages(
    allItems: Array<{ id: string; threadId: string }>
  ): Array<{ id: string; threadId: string }> {
    const seen = new Map<string, { id: string; threadId: string }>()
    for (const item of allItems) {
      if (!seen.has(item.id)) {
        seen.set(item.id, item)
      }
    }
    return [...seen.values()]
  }

  /**
   * Determine if a status should be updated based on the current status and the new classification.
   * Only "forward" transitions are allowed (e.g., applied → acknowledged → interviewing → denied).
   */
  private shouldUpdateStatus(currentStatus: JobMatchStatus, newStatus: JobMatchStatus): boolean {
    const statusOrder: Record<string, number> = {
      applied: 0,
      acknowledged: 1,
      interviewing: 2,
      denied: 3
    }

    const currentOrder = statusOrder[currentStatus]
    const newOrder = statusOrder[newStatus]

    if (currentOrder === undefined || newOrder === undefined) return false

    // Allow forward transitions and denial from any post-applied state
    if (newStatus === "denied") return currentOrder >= 0
    return newOrder > currentOrder
  }
}

/**
 * Strip characters that could break or widen a Gmail query term.
 * Removes double quotes and backslashes to keep quoted phrases well-formed.
 */
function sanitizeQueryTerm(term: string): string {
  return term.replace(/["\\]/g, "")
}
