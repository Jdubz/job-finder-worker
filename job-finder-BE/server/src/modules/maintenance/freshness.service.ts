import { randomUUID } from 'node:crypto'
import { logger } from '../../logger'
import { FreshnessRepository, type VerificationStatus, type ListingToVerify } from './freshness.repository'

export interface FreshnessResult {
  success: boolean
  checked: number
  stillLive: number
  notFound: number
  redirected: number
  unknown: number
  autoIgnored: number
  error?: string
}

export interface FreshnessOptions {
  /** How stale a verification must be to re-check. Default 72h. */
  staleAfterHours?: number
  /** Max listings to check per run. Default 50. */
  batchSize?: number
  /** Per-request timeout in ms. Default 8000. */
  requestTimeoutMs?: number
  /** Delay between requests in ms (avoid hammering Greenhouse/Ashby/etc.). Default 500. */
  perRequestDelayMs?: number
  /** User-Agent for the verification probe. */
  userAgent?: string
  /** Injection point for tests. */
  fetchImpl?: typeof fetch
}

const DEFAULT_OPTIONS: Required<Omit<FreshnessOptions, 'fetchImpl'>> = {
  staleAfterHours: 72,
  batchSize: 50,
  requestTimeoutMs: 8000,
  perRequestDelayMs: 500,
  userAgent: 'job-finder-freshness/1.0 (+https://joshwentworth.com)'
}

/**
 * Patterns in response bodies that indicate the listing is closed even though
 * the host returned 200 (common on Greenhouse, Lever, Ashby careers pages).
 */
const CLOSED_BODY_PATTERNS: RegExp[] = [
  /no longer accepting applications/i,
  /this (?:job|position|posting) (?:has been|is) (?:closed|filled|removed)/i,
  /(?:this |the )?(?:job|position|posting|listing|role)[^.]{0,40}(?:is )?no longer available/i,
  /the position you are looking for is no longer available/i,
  /we are not currently accepting applications/i
]

/**
 * URLs we treat as "redirected to a careers home" — host kept the URL alive
 * but bounced us to a listing index, which means the specific role is gone.
 */
const CAREERS_HOME_PATHS = [/\/careers\/?$/i, /\/jobs\/?$/i, /\/openings\/?$/i]

export class FreshnessService {
  private opts: Required<Omit<FreshnessOptions, 'fetchImpl'>>
  private fetchImpl: typeof fetch

  constructor(
    private repo = new FreshnessRepository(),
    options: FreshnessOptions = {}
  ) {
    this.opts = { ...DEFAULT_OPTIONS, ...options }
    this.fetchImpl = options.fetchImpl ?? fetch
  }

  async run(): Promise<FreshnessResult> {
    logger.info({ opts: this.opts }, 'Freshness check starting')

    const cutoffIso = new Date(Date.now() - this.opts.staleAfterHours * 60 * 60 * 1000).toISOString()
    let candidates: ListingToVerify[]
    try {
      candidates = this.repo.selectListingsToVerify(cutoffIso, this.opts.batchSize)
    } catch (error) {
      logger.error({ error }, 'Freshness check failed to load candidates')
      return this.errorResult(error)
    }

    const counters = { stillLive: 0, notFound: 0, redirected: 0, unknown: 0, autoIgnored: 0 }

    for (const listing of candidates) {
      const targetUrl = listing.applyUrl ?? listing.url
      let status: VerificationStatus = 'unknown'
      try {
        status = await this.probe(targetUrl)
      } catch (error) {
        logger.warn({ error, listingId: listing.id, url: targetUrl }, 'Freshness probe failed')
        status = 'unknown'
      }

      const nowIso = new Date().toISOString()
      try {
        this.repo.recordVerification(listing.id, status, nowIso)
      } catch (error) {
        logger.error({ error, listingId: listing.id }, 'Failed to record verification result')
      }

      if (status === 'live') counters.stillLive++
      else if (status === 'not_found') counters.notFound++
      else if (status === 'redirected') counters.redirected++
      else counters.unknown++

      if ((status === 'not_found' || status === 'redirected') && listing.matchStatus === 'active') {
        const note = `auto-ignored ${nowIso.slice(0, 10)}: listing verification returned '${status}' for ${targetUrl}`
        try {
          const flipped = this.repo.autoIgnoreMatch(listing.matchId, note, nowIso, randomUUID())
          if (flipped) counters.autoIgnored++
        } catch (error) {
          logger.error(
            { error, matchId: listing.matchId, listingId: listing.id },
            'Failed to auto-ignore stale match'
          )
        }
      }

      if (this.opts.perRequestDelayMs > 0) {
        await sleep(this.opts.perRequestDelayMs)
      }
    }

    const result: FreshnessResult = {
      success: true,
      checked: candidates.length,
      ...counters
    }
    logger.info(result, 'Freshness check completed')
    return result
  }

  private async probe(url: string): Promise<VerificationStatus> {
    if (!url || !/^https?:\/\//i.test(url)) return 'unknown'

    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), this.opts.requestTimeoutMs)
    try {
      const response = await this.fetchImpl(url, {
        method: 'GET',
        redirect: 'follow',
        signal: ac.signal,
        headers: {
          'User-Agent': this.opts.userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
      })

      if (response.status === 404 || response.status === 410) return 'not_found'
      if (response.status >= 500 || response.status === 429) return 'unknown'
      if (!response.ok) return 'unknown'

      try {
        const finalUrl = new URL(response.url)
        if (CAREERS_HOME_PATHS.some((rx) => rx.test(finalUrl.pathname))) return 'redirected'
      } catch {
        // ignore URL parse failure; treat as live based on status
      }

      const body = await response.text().catch(() => '')
      if (CLOSED_BODY_PATTERNS.some((rx) => rx.test(body))) return 'not_found'

      return 'live'
    } finally {
      clearTimeout(timer)
    }
  }

  private errorResult(error: unknown): FreshnessResult {
    return {
      success: false,
      checked: 0,
      stillLive: 0,
      notFound: 0,
      redirected: 0,
      unknown: 0,
      autoIgnored: 0,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
