/* Collect recent job-related Gmail messages and extract company names into a simple list.
   - No queue writes, no ingest_state writes.
   - Uses existing Gmail auth/config + AI parser for company extraction.
*/
const { GmailIngestService } = require("../job-finder-BE/server/dist/modules/gmail/gmail-ingest.service.js")
const { ConfigRepository } = require("../job-finder-BE/server/dist/modules/config/config.repository.js")
const { EmailIngestStateRepository } = require("../job-finder-BE/server/dist/modules/gmail/email-ingest-state.repository.js")
const { JobQueueService } = require("../job-finder-BE/server/dist/modules/job-queue/job-queue.service.js")
const { parseEmailBodyWithAiFallback } = require("../job-finder-BE/server/dist/modules/gmail/gmail-message-parser.js")
const sqlite = require("../job-finder-BE/server/dist/db/sqlite.js")

// Override migrations dir for local runs
sqlite.migrationsDir = require("path").join(process.cwd(), "infra/sqlite/migrations")

// In-memory config: widen scan but keep it modest
ConfigRepository.prototype.get = function (key) {
  if (key !== "gmail-ingest") return null
  return {
    payload: {
      enabled: true,
      maxAgeDays: Number(process.env.GMAIL_MAX_AGE_DAYS ?? 14),
      maxMessages: Number(process.env.GMAIL_MAX_MESSAGES ?? 50),
      aiFallbackEnabled: true
    }
  }
}

// Disable state writes
EmailIngestStateRepository.prototype.isMessageProcessed = () => false
EmailIngestStateRepository.prototype.recordProcessed = () => {}

// Disable queue writes
JobQueueService.prototype.submitJob = function () { return { id: "dry-run" } }
JobQueueService.prototype.submitCompany = function () { return { id: "dry-run" } }

async function main() {
  const svc = new GmailIngestService()

  // Access private helpers (TS private, JS accessible)
  const getSettings = svc.getSettings.bind(svc)
  const ensureToken = svc.ensureAccessToken.bind(svc)
  const fetchMessages = svc.fetchMessages.bind(svc)
  const fetchFull = svc.fetchFullMessages.bind(svc)
  const extractBody = svc.extractBody.bind(svc)
  const isJobRelated = svc.isJobRelated.bind(svc)
  const getHeader = svc.getHeader.bind(svc)

  const settings = getSettings()
  if (!settings?.enabled) throw new Error("gmail-ingest disabled or missing config")

  const accounts = svc.auth.listAccounts()
const bodies = []
const companies = new Set()
const jobSenderHints = ["indeed.com", "ashbyhq.com", "jobleads.com", "lever.co", "greenhouse.io", "smartrecruiters", "ziprecruiter", "wellfound.com", "builtin.com", "angel.co", "ripplematch.com"]
const jobKeywordRe = /\b(job|role|opening|position|hiring|opportunity|matches|apply|jobs)\b/i

  for (const acct of accounts) {
    const tokens = svc.auth.getTokensForGmailEmail(acct.gmailEmail)
    if (!tokens) continue
    const ensured = await ensureToken(tokens)
    const accessToken = ensured.access_token
    const queryParts = []
    if (settings.label) queryParts.push(`label:${settings.label}`)
    if (settings.maxAgeDays) queryParts.push(`newer_than:${settings.maxAgeDays}d`)
    const q = queryParts.join(" ").trim()
    const maxResults = settings.maxMessages ?? 50
    const list = await fetchMessages(accessToken, ensured.historyId, q || undefined, maxResults)
    const full = await fetchFull(accessToken, list.items)
    for (const m of full) {
      const subject = getHeader(m, "Subject")
      const from = getHeader(m, "From")
      const body = extractBody(m)
      // Stricter filter: sender hint OR keyword in subject/body
      const senderDomain = from?.split("@")[1]?.toLowerCase() || ""
      const senderLooksJob = jobSenderHints.some((d) => senderDomain.includes(d))
      const keywordHit = jobKeywordRe.test(subject || "") || jobKeywordRe.test((body || "").slice(0, 2000))
      if (!senderLooksJob && !keywordHit) continue

      bodies.push({ subject, from, body })

      // Heuristic company pick from subject "Role @ Company"
      const atMatch = subject ? subject.match(/@\\s*([^@]+)$/) || subject.match(/\\bat\\s+([^@]+)$/i) : null
      if (atMatch && atMatch[1]) companies.add(atMatch[1].trim())

      // Body heuristics: find " at <Company>" patterns
      const lines = (body || "").split(/\\n+/).slice(0, 200)
      for (const line of lines) {
        const m1 = line.match(/\\bat\\s+([A-Z][A-Za-z0-9 .,&'\\-]{2,80})/)
        if (m1 && m1[1]) companies.add(m1[1].trim())
        const m2 = line.match(/\\bwith\\s+([A-Z][A-Za-z0-9 .,&'\\-]{2,80})/)
        if (m2 && m2[1]) companies.add(m2[1].trim())
      }
    }
  }

  // Per-email AI pass: ask for companies only, truncating body to keep prompt small
  const collectionSummary = []
  for (const [i, b] of bodies.entries()) {
    const truncatedBody = (b.body || "").slice(0, 8000)
    collectionSummary.push({
      idx: i + 1,
      from: b.from,
      subject: b.subject,
      bodyChars: (b.body || "").length,
      bodySentToAiChars: truncatedBody.length,
      bodySentToAiPreview: truncatedBody.slice(0, 400)
    })
    if (!truncatedBody) continue
    try {
      const parsed = await parseEmailBodyWithAiFallback(truncatedBody, [], {
        aiFallbackEnabled: true,
        promptOverride:
          "List the hiring company names mentioned in this email. Return a JSON array of unique company names. Do not include roles, locations, or links."
      })
      parsed
        .map((j) => j.company)
        .filter((c) => c && typeof c === "string")
        .forEach((c) => companies.add(c.trim()))
    } catch (err) {
      console.error(`AI extraction failed for email ${i + 1}:`, err?.message || err)
    }
  }

  console.log(
    JSON.stringify(
      {
        gmailEmailsScanned: bodies.length,
        collectionSummary,
        companyCount: companies.size,
        companies: Array.from(companies).slice(0, 100)
      },
      null,
      2
    )
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
