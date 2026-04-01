import type { JobMatchWithListing, MatchSignals } from "@shared/types"

/** Known ATS domains that send emails on behalf of companies */
const ATS_DOMAINS = [
  "greenhouse.io",
  "lever.co",
  "ashbyhq.com",
  "smartrecruiters.com",
  "breezy.hr",
  "workable.com",
  "jobvite.com",
  "icims.com",
  "myworkdayjobs.com",
  "workday.com",
  "hire.lever.co",
  "boards.greenhouse.io",
  "recruiting.paylocity.com"
]

export interface ParsedEmail {
  sender: string
  senderDomain: string | undefined
  replyTo?: string
  subject: string
  body: string
  receivedAt: Date
}

export interface MatchCandidate {
  jobMatchId: string
  confidence: number
  signals: MatchSignals
}

/**
 * Extract domain from a URL (e.g., "https://www.example.com/path" → "example.com")
 */
function extractDomainFromUrl(url: string | undefined | null): string | undefined {
  if (!url) return undefined
  try {
    const hostname = new URL(url).hostname.toLowerCase()
    // Strip www. prefix
    return hostname.replace(/^www\./, "")
  } catch {
    return undefined
  }
}

/**
 * Normalize a company name for fuzzy matching:
 * lowercase, strip common suffixes (Inc, LLC, Corp, Ltd, etc.), trim
 */
function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/,?\s*(inc\.?|llc\.?|corp\.?|ltd\.?|co\.?|company|corporation|limited|group|holdings?)$/i, "")
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
}

/**
 * Normalize a job title for fuzzy matching:
 * lowercase, strip common prefixes (Sr., Senior, Lead, etc.)
 */
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/^(sr\.?\s*|senior\s+|jr\.?\s*|junior\s+|lead\s+|principal\s+|staff\s+)/i, "")
    .trim()
}

/**
 * Check if a domain is a known ATS platform
 */
function isAtsDomain(domain: string | undefined): boolean {
  if (!domain) return false
  const lower = domain.toLowerCase()
  return ATS_DOMAINS.some((ats) => lower.endsWith(ats))
}

/** Common email-sending subdomain prefixes */
const EMAIL_PREFIXES = ["mail.", "email.", "no-reply.", "noreply.", "alerts.", "notifications.", "notify.", "updates."]

/**
 * Extract the "brand" portion from a sender domain for fuzzy matching.
 *
 *   mail.dropboxjobs.com  → "dropbox"
 *   stripe.com            → "stripe"
 *   no-reply@mongodb.com  → "mongodb"
 *   nurture.icims.com     → "icims" (ATS — won't match companies, which is correct)
 *   openloophealth.com    → "openloophealth"
 */
function extractBrandFromDomain(domain: string): string {
  let d = domain.toLowerCase()

  // Strip common email-sending prefixes
  for (const prefix of EMAIL_PREFIXES) {
    if (d.startsWith(prefix)) {
      d = d.slice(prefix.length)
      break
    }
  }

  // Extract the registrable domain (second-level + TLD)
  const parts = d.split(".")
  // e.g. ["dropboxjobs", "com"] or ["us", "greenhouse-mail", "io"]
  const sld = parts.length >= 2 ? parts[parts.length - 2] : parts[0]

  // Strip common suffixes from the SLD: "dropboxjobs" → "dropbox"
  return sld
    .replace(/(jobs|careers|recruiting|hiring|talent|mail|email)$/i, "")
    .replace(/-$/, "") || sld
}

/**
 * Normalize sender domain for domain matching: strip email-sending prefixes
 * and try to recover the root company domain.
 *
 *   mail.dropboxjobs.com → dropboxjobs.com → (brand "dropbox")
 *   email.informeddelivery.usps.com → informeddelivery.usps.com
 */
function normalizeSenderDomain(domain: string): string {
  let d = domain.toLowerCase()
  for (const prefix of EMAIL_PREFIXES) {
    if (d.startsWith(prefix)) {
      d = d.slice(prefix.length)
      break
    }
  }
  return d
}

/**
 * Match an email against a list of active job applications.
 * Returns ranked match candidates with confidence scores.
 */
export function matchEmailToApplications(
  email: ParsedEmail,
  appliedMatches: JobMatchWithListing[]
): MatchCandidate[] {
  const candidates: MatchCandidate[] = []

  for (const match of appliedMatches) {
    const signals: MatchSignals = {}
    let score = 0

    const companyName = match.isGhost
      ? match.ghostCompany ?? ""
      : match.listing.companyName
    const companyWebsite = match.isGhost
      ? match.ghostUrl
      : match.company?.website
    const jobTitle = match.isGhost
      ? match.ghostTitle ?? ""
      : match.listing.title

    const companyDomain = extractDomainFromUrl(companyWebsite)

    // Signal 1: Company domain match (+40)
    if (email.senderDomain && companyDomain) {
      const normalizedSender = normalizeSenderDomain(email.senderDomain)
      if (
        email.senderDomain === companyDomain ||
        email.senderDomain.endsWith(`.${companyDomain}`) ||
        normalizedSender === companyDomain ||
        normalizedSender.endsWith(`.${companyDomain}`)
      ) {
        signals.companyDomainMatch = true
        score += 40
      }
    }

    // Signal 2: Company name in subject or body (+25)
    if (companyName) {
      const normalizedCompany = normalizeCompanyName(companyName)
      if (normalizedCompany.length >= 3) {
        const textToSearch = `${email.subject}\n${email.body}`.toLowerCase()
        if (textToSearch.includes(normalizedCompany)) {
          signals.companyNameInBody = true
          score += 25
        }
      }
    }

    // Signal 3: ATS header/reply-to match (+30)
    // If the sender is an ATS, check Reply-To for the actual company domain
    if (isAtsDomain(email.senderDomain)) {
      const replyToDomain = email.replyTo?.match(/@([a-zA-Z0-9.-]+)/)?.[1]?.toLowerCase()
      if (replyToDomain && companyDomain && (replyToDomain === companyDomain || replyToDomain.endsWith(`.${companyDomain}`))) {
        signals.atsHeaderMatch = true
        score += 30
      }
      // Also try to extract company name from subject for ATS emails
      // Common pattern: "Your application at [Company]" or "[Company] - Your Application"
      if (!signals.companyNameInBody && companyName) {
        const normalizedCompany = normalizeCompanyName(companyName)
        const subjectLower = email.subject.toLowerCase()
        if (subjectLower.includes(normalizedCompany)) {
          signals.companyNameInBody = true
          score += 25
        }
      }
    }

    // Signal 4: Sender domain brand matches company name (+35)
    // Catches cases like stripe.com→"Stripe", mongodb.com→"MongoDB", dropboxjobs.com→"Dropbox"
    if (!signals.companyDomainMatch && email.senderDomain && companyName && !isAtsDomain(email.senderDomain)) {
      const normalizedCompany = normalizeCompanyName(companyName)
      if (normalizedCompany.length >= 3) {
        const brand = extractBrandFromDomain(email.senderDomain)
        if (brand.length >= 3 && (brand.includes(normalizedCompany) || normalizedCompany.includes(brand))) {
          signals.senderDomainNameMatch = true
          score += 35
        }
      }
    }

    // Signal 5: Job title match (+20)
    if (jobTitle) {
      const normalizedJobTitle = normalizeTitle(jobTitle)
      if (normalizedJobTitle.length >= 5) {
        const subjectLower = email.subject.toLowerCase()
        if (subjectLower.includes(normalizedJobTitle)) {
          signals.jobTitleMatch = true
          score += 20
        }
      }
    }

    // Signal 6: Temporal proximity (+0-15)
    const appliedAt = match.appliedAt ? new Date(String(match.appliedAt)) : new Date(String(match.updatedAt))
    const daysSinceApplied = (email.receivedAt.getTime() - appliedAt.getTime()) / (1000 * 60 * 60 * 24)
    if (daysSinceApplied >= 0 && daysSinceApplied < 1) {
      signals.temporalProximity = 15
      score += 15
    } else if (daysSinceApplied >= 0 && daysSinceApplied < 3) {
      signals.temporalProximity = 10
      score += 10
    } else if (daysSinceApplied >= 0 && daysSinceApplied < 7) {
      signals.temporalProximity = 5
      score += 5
    } else {
      signals.temporalProximity = 0
    }

    if (score > 0) {
      candidates.push({
        jobMatchId: match.id!,
        confidence: Math.min(100, score),
        signals
      })
    }
  }

  // Sort by confidence descending
  candidates.sort((a, b) => b.confidence - a.confidence)
  return candidates
}
