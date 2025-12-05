import { GmailAuthService, type GmailTokenPayload } from "./gmail-auth.service"
import { logger } from "../../logger"

export type IngestJobResult = {
  gmailEmail: string
  jobsFound: number
  jobsQueued: number
  error?: string
}

/**
 * Skeleton ingest service. Actual Gmail API integration to fetch messages and parse
 * listings will be added incrementally.
 */
export class GmailIngestService {
  private readonly auth = new GmailAuthService()

  async ingestAll(): Promise<IngestJobResult[]> {
    const accounts = this.auth.listAccounts()
    const results: IngestJobResult[] = []
    for (const acct of accounts) {
      try {
        const tokens = this.auth.getTokensForGmailEmail(acct.gmailEmail)
        if (!tokens) {
          results.push({ gmailEmail: acct.gmailEmail, jobsFound: 0, jobsQueued: 0, error: "missing tokens" })
          continue
        }
        const result = await this.ingestAccount(acct.gmailEmail, tokens)
        results.push(result)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        logger.error({ gmailEmail: acct.gmailEmail, error: message }, "Gmail ingest failed")
        results.push({ gmailEmail: acct.gmailEmail, jobsFound: 0, jobsQueued: 0, error: message })
      }
    }
    return results
  }

  // Placeholder: implement Gmail fetch + parsing in follow-up
  private async ingestAccount(gmailEmail: string, _tokens: GmailTokenPayload): Promise<IngestJobResult> {
    logger.info({ gmailEmail }, "Gmail ingest placeholder run")
    // TODO: fetch messages, extract jobs, enqueue via JobQueueService.submitJob
    return { gmailEmail, jobsFound: 0, jobsQueued: 0 }
  }
}
