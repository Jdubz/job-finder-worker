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
import { matchEmailToApplications, type ParsedEmail } from "./email-application-matcher"
import { ApplicationEmailRepository, type CreateApplicationEmailInput } from "./application-email.repository"
import { StatusHistoryRepository } from "./status-history.repository"
import { JobMatchRepository } from "../job-matches/job-match.repository"
import type { JobMatchStatus } from "@shared/types"
import { logger } from "../../logger"

/** Known ATS/recruiting platform sender domains */
const APPLICATION_SENDER_DOMAINS = [
  "greenhouse.io",
  "lever.co",
  "ashbyhq.com",
  "smartrecruiters.com",
  "breezy.hr",
  "workable.com",
  "jobvite.com",
  "icims.com",
  "myworkdayjobs.com",
  "linkedin.com",
  "indeed.com",
  "ziprecruiter.com",
  "workday.com",
  "hire.lever.co"
]

/** Keywords suggesting an application-related email */
const APPLICATION_KEYWORDS = [
  "application",
  "applied",
  "interview",
  "candidacy",
  "candidate",
  "position",
  "role",
  "hiring",
  "offer",
  "unfortunately",
  "move forward",
  "next steps"
]

/** Statuses that represent an active application (eligible for email matching) */
const ACTIVE_APPLICATION_STATUSES: JobMatchStatus[] = ["applied", "acknowledged", "interviewing"]

/** High confidence threshold for auto-linking and status updates */
const HIGH_CONFIDENCE = 70
/** Medium confidence threshold for linking without status update */
const MEDIUM_CONFIDENCE = 40

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

  async scanAll(userEmail?: string): Promise<TrackerScanResult[]> {
    let accounts = this.auth.listAccounts()
    if (userEmail) {
      accounts = accounts.filter((a) => a.userEmail.toLowerCase() === userEmail.toLowerCase())
    }
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
        const result = await this.scanAccount(acct.gmailEmail, tokens)
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

  private async scanAccount(gmailEmail: string, tokens: GmailTokenPayload): Promise<TrackerScanResult> {
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

    // Build a query for application-related emails from the last 14 days
    const query = "newer_than:14d"
    const messages = await fetchMessageList(ensured.access_token, query, 50)

    if (!messages.items.length) return result

    const fullMessages = await fetchFullMessages(ensured.access_token, messages.items)

    // Get all active applications for matching
    const appliedMatches = this.matchRepo.listWithListings({
      status: "all",
      limit: 200
    }).filter((m) => ACTIVE_APPLICATION_STATUSES.includes(m.status as JobMatchStatus))

    // Also build a set of company domains from applied matches for filtering
    const companyDomains = new Set<string>()
    for (const match of appliedMatches) {
      const website = match.isGhost ? match.ghostUrl : match.company?.website
      if (website) {
        try {
          const hostname = new URL(website).hostname.toLowerCase().replace(/^www\./, "")
          companyDomains.add(hostname)
        } catch { /* ignore invalid URLs */ }
      }
    }

    for (const msg of fullMessages) {
      // Skip already-processed messages
      if (this.emailRepo.isProcessed(gmailEmail, msg.id)) continue

      const sender = getHeader(msg, "From") ?? ""
      const subject = getHeader(msg, "Subject") ?? ""
      const replyTo = getHeader(msg, "Reply-To")
      const dateHeader = getHeader(msg, "Date")
      const body = extractBody(msg)
      const senderDomain = extractSenderDomain(sender)

      // Filter: is this email application-related?
      if (!this.isApplicationRelated(sender, subject, body, senderDomain, companyDomains)) {
        continue
      }

      result.emailsProcessed++

      // Classify the email
      const classification = classifyEmail(subject, body, sender)

      // Match against applied jobs
      const parsedEmail: ParsedEmail = {
        sender,
        senderDomain,
        replyTo,
        subject,
        body,
        receivedAt: dateHeader ? new Date(dateHeader) : new Date()
      }
      const candidates = matchEmailToApplications(parsedEmail, appliedMatches)
      const topCandidate = candidates[0]

      // Build the email record
      const emailInput: CreateApplicationEmailInput = {
        gmailMessageId: msg.id,
        gmailThreadId: msg.threadId,
        gmailEmail,
        sender,
        senderDomain,
        subject,
        receivedAt: parsedEmail.receivedAt.toISOString(),
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
        // High confidence: auto-link and potentially update status
        emailInput.jobMatchId = topCandidate.jobMatchId
        emailInput.autoLinked = true
        result.emailsLinked++

        const appEmail = this.emailRepo.create(emailInput)

        // Auto-update status if classification warrants it
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
        // Medium confidence: link but don't auto-update status
        emailInput.jobMatchId = topCandidate.jobMatchId
        emailInput.autoLinked = false
        result.emailsLinked++
        this.emailRepo.create(emailInput)
      } else {
        // No match or low confidence: create unlinked email
        this.emailRepo.create(emailInput)
      }
    }

    return result
  }

  /**
   * Determine if an email is application-related based on sender, subject, and body.
   */
  private isApplicationRelated(
    sender: string,
    subject: string,
    body: string,
    senderDomain: string | undefined,
    companyDomains: Set<string>
  ): boolean {
    // Check if sender is from a known ATS/recruiting platform
    if (senderDomain && APPLICATION_SENDER_DOMAINS.some((d) => senderDomain.endsWith(d))) {
      return true
    }

    // Check if sender is from a company the user has applied to
    if (senderDomain && companyDomains.has(senderDomain)) {
      return true
    }

    // Check for application-related keywords in subject
    const textToCheck = `${subject}\n${body.slice(0, 2000)}`.toLowerCase()
    return APPLICATION_KEYWORDS.some((kw) => textToCheck.includes(kw))
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
