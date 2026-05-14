import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
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
  /** Max body bytes read from the probe response before pattern matching. Default 256 KiB. */
  maxBodyBytes?: number
  /** Max redirect hops to follow. Default 5. */
  maxRedirects?: number
  /** User-Agent for the verification probe. */
  userAgent?: string
  /** Injection point for tests. */
  fetchImpl?: typeof fetch
  /** Injection point for DNS lookup (tests). */
  dnsLookup?: typeof lookup
}

const DEFAULT_OPTIONS: Required<Omit<FreshnessOptions, 'fetchImpl' | 'dnsLookup'>> = {
  staleAfterHours: 72,
  batchSize: 50,
  requestTimeoutMs: 8000,
  perRequestDelayMs: 500,
  maxBodyBytes: 256 * 1024,
  maxRedirects: 5,
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
 * Pathnames that strongly suggest "we got bounced to the careers index", but
 * only when the URL has no job-identifier query parameter. Greenhouse and
 * similar use query-style IDs (e.g. `/jobs?gh_jid=12345`) where the path
 * alone looks like a careers home.
 */
const CAREERS_HOME_PATHS = [/^\/careers\/?$/i, /^\/jobs\/?$/i, /^\/openings\/?$/i, /^\/positions\/?$/i]

/** Query param names that indicate the URL still identifies a specific job. */
const JOB_ID_QUERY_KEYS = new Set([
  'id', 'jobid', 'jid', 'gh_jid', 'req', 'requisitionid', 'reqid', 'job', 'jobreqid', 'postingid', 'reqno'
])

export class FreshnessService {
  private opts: Required<Omit<FreshnessOptions, 'fetchImpl' | 'dnsLookup'>>
  private fetchImpl: typeof fetch
  private dnsLookup: typeof lookup

  constructor(
    private repo = new FreshnessRepository(),
    options: FreshnessOptions = {}
  ) {
    this.opts = { ...DEFAULT_OPTIONS, ...options }
    this.fetchImpl = options.fetchImpl ?? fetch
    this.dnsLookup = options.dnsLookup ?? lookup
  }

  async run(): Promise<FreshnessResult> {
    logger.info({ opts: { ...this.opts, userAgent: undefined } }, 'Freshness check starting')

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

      if (status === 'not_found' || status === 'redirected') {
        const note = `auto-ignored ${nowIso.slice(0, 10)}: listing verification returned '${status}' for ${targetUrl}`
        try {
          counters.autoIgnored += this.repo.autoIgnoreActiveMatchesForListing(listing.id, note, nowIso)
        } catch (error) {
          logger.error({ error, listingId: listing.id }, 'Failed to auto-ignore matches for stale listing')
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

  /**
   * Probe a URL, following redirects manually so each hop's hostname can be
   * validated against private/loopback/link-local IP ranges (SSRF guard).
   */
  private async probe(initialUrl: string): Promise<VerificationStatus> {
    if (!initialUrl || !/^https?:\/\//i.test(initialUrl)) return 'unknown'

    let currentUrl: URL
    try {
      currentUrl = new URL(initialUrl)
    } catch {
      return 'unknown'
    }

    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), this.opts.requestTimeoutMs)

    try {
      for (let hop = 0; hop <= this.opts.maxRedirects; hop++) {
        if (!(await this.isPublicHost(currentUrl.hostname))) {
          logger.warn({ url: currentUrl.toString() }, 'Freshness probe blocked non-public destination')
          return 'unknown'
        }

        const response = await this.fetchImpl(currentUrl.toString(), {
          method: 'GET',
          redirect: 'manual',
          signal: ac.signal,
          headers: {
            'User-Agent': this.opts.userAgent,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
          }
        })

        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get('location')
          if (!location) {
            try { await response.body?.cancel() } catch { /* ignore */ }
            return 'unknown'
          }
          let next: URL
          try {
            next = new URL(location, currentUrl)
          } catch {
            try { await response.body?.cancel() } catch { /* ignore */ }
            return 'unknown'
          }
          try { await response.body?.cancel() } catch { /* ignore */ }
          if (next.protocol !== 'http:' && next.protocol !== 'https:') return 'unknown'
          currentUrl = next
          continue
        }

        return await this.classifyResponse(response, currentUrl)
      }

      // Hit the redirect cap — treat as unknown rather than auto-acting on it.
      return 'unknown'
    } finally {
      clearTimeout(timer)
    }
  }

  private async classifyResponse(response: Response, finalUrl: URL): Promise<VerificationStatus> {
    if (response.status === 404 || response.status === 410) {
      try { await response.body?.cancel() } catch { /* ignore */ }
      return 'not_found'
    }
    if (response.status >= 500 || response.status === 429 || !response.ok) {
      try { await response.body?.cancel() } catch { /* ignore */ }
      return 'unknown'
    }

    if (this.looksLikeCareersHome(finalUrl)) {
      try { await response.body?.cancel() } catch { /* ignore */ }
      return 'redirected'
    }

    const body = await this.readBodyCapped(response)
    if (CLOSED_BODY_PATTERNS.some((rx) => rx.test(body))) return 'not_found'
    return 'live'
  }

  private looksLikeCareersHome(url: URL): boolean {
    if (!CAREERS_HOME_PATHS.some((rx) => rx.test(url.pathname))) return false
    for (const key of url.searchParams.keys()) {
      if (JOB_ID_QUERY_KEYS.has(key.toLowerCase())) return false
    }
    return true
  }

  /** Read up to maxBodyBytes from the response, aborting the rest. */
  private async readBodyCapped(response: Response): Promise<string> {
    if (!response.body) {
      return await response.text().catch(() => '')
    }
    const reader = response.body.getReader()
    const decoder = new TextDecoder('utf-8', { fatal: false })
    const cap = this.opts.maxBodyBytes
    let received = 0
    let out = ''
    try {
      while (received < cap) {
        const { done, value } = await reader.read()
        if (done) break
        const remaining = cap - received
        if (value.byteLength <= remaining) {
          received += value.byteLength
          out += decoder.decode(value, { stream: true })
        } else {
          // Last chunk pushes us over the cap — slice and stop reading.
          out += decoder.decode(value.subarray(0, remaining), { stream: true })
          received = cap
          break
        }
      }
      out += decoder.decode()
    } finally {
      try { await reader.cancel() } catch { /* ignore */ }
    }
    return out
  }

  /**
   * SSRF guard: rejects loopback, private, link-local, and unspecified
   * destinations. Resolves DNS for hostnames; bare IPs are checked directly.
   * Returns true only when every resolved address is a public unicast IP.
   */
  private async isPublicHost(hostname: string): Promise<boolean> {
    if (!hostname) return false
    const host = hostname.toLowerCase()
    if (host === 'localhost' || host.endsWith('.localhost') || host === 'ip6-localhost') return false

    const candidates: string[] = []
    const literal = isIP(host)
    if (literal) {
      candidates.push(host)
    } else {
      try {
        const results = await this.dnsLookup(host, { all: true })
        for (const r of results) candidates.push(r.address)
      } catch {
        return false
      }
    }

    if (candidates.length === 0) return false
    return candidates.every((ip) => isPublicIp(ip))
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

/**
 * Public unicast check.
 *
 * Rejects every IANA-reserved IPv4 block (RFC 6890 et al.) and every IPv6
 * non-global range we don't want the freshness probe to reach: loopback,
 * private (RFC1918), CGNAT, link-local, multicast, broadcast, cloud-metadata,
 * documentation (TEST-NET-1/2/3, 2001:db8::/32), benchmarking (198.18.0.0/15),
 * 6to4 anycast, IETF protocol assignments, ULA (fc00::/7), discard-only
 * (100::/64), and IPv4-mapped wrappers around any of the above.
 */
export function isPublicIp(ip: string): boolean {
  const family = isIP(ip)
  if (family === 4) return isPublicIPv4(ip)
  if (family === 6) return isPublicIPv6(ip)
  return false
}

function isPublicIPv4(ip: string): boolean {
  const parts = ip.split('.').map((p) => Number(p))
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return false
  const [a, b, c] = parts
  if (a === 0) return false                                 // 0.0.0.0/8 "this network"
  if (a === 10) return false                                // 10.0.0.0/8 RFC1918
  if (a === 100 && b >= 64 && b <= 127) return false        // 100.64.0.0/10 CGNAT
  if (a === 127) return false                               // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return false                  // 169.254.0.0/16 link-local (incl. AWS metadata)
  if (a === 172 && b >= 16 && b <= 31) return false         // 172.16.0.0/12 RFC1918
  if (a === 192 && b === 0 && c === 0) return false         // 192.0.0.0/24 IETF protocol assignments
  if (a === 192 && b === 0 && c === 2) return false         // 192.0.2.0/24 TEST-NET-1 (docs)
  if (a === 192 && b === 88 && c === 99) return false       // 192.88.99.0/24 6to4 relay anycast
  if (a === 192 && b === 168) return false                  // 192.168.0.0/16 RFC1918
  if (a === 198 && (b === 18 || b === 19)) return false     // 198.18.0.0/15 benchmarking
  if (a === 198 && b === 51 && c === 100) return false      // 198.51.100.0/24 TEST-NET-2 (docs)
  if (a === 203 && b === 0 && c === 113) return false       // 203.0.113.0/24 TEST-NET-3 (docs)
  if (a >= 224) return false                                // 224.0.0.0/4 multicast + 240.0.0.0/4 reserved
  if (a === 255) return false                               // 255.255.255.255 broadcast
  return true
}

function isPublicIPv6(ip: string): boolean {
  const lower = ip.toLowerCase()
  // IPv4-mapped (e.g. ::ffff:127.0.0.1) — defer to the IPv4 check.
  const v4mapped = lower.match(/^::ffff:([0-9.]+)$/)
  if (v4mapped) return isPublicIPv4(v4mapped[1])

  const groups = expandIPv6(lower)
  if (!groups) return false

  const [g0, g1, g2, g3] = groups
  // Unspecified ::
  if (groups.every((g) => g === 0)) return false
  // Loopback ::1
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && groups[4] === 0 && groups[5] === 0 && groups[6] === 0 && groups[7] === 1) return false
  // 100::/64 discard-only (RFC 6666)
  if (g0 === 0x100 && g1 === 0 && g2 === 0 && g3 === 0) return false
  // 2001:db8::/32 documentation
  if (g0 === 0x2001 && g1 === 0x0db8) return false
  // fc00::/7 unique-local
  if ((g0 & 0xfe00) === 0xfc00) return false
  // fe80::/10 link-local
  if ((g0 & 0xffc0) === 0xfe80) return false
  // ff00::/8 multicast
  if ((g0 & 0xff00) === 0xff00) return false
  return true
}

/** Expand an IPv6 address into exactly 8 numeric groups, or null if malformed. */
function expandIPv6(ip: string): number[] | null {
  const dcIdx = ip.indexOf('::')
  let parts: string[]
  if (dcIdx === -1) {
    parts = ip.split(':')
    if (parts.length !== 8) return null
  } else {
    const head = ip.slice(0, dcIdx)
    const tail = ip.slice(dcIdx + 2)
    const headParts = head === '' ? [] : head.split(':')
    const tailParts = tail === '' ? [] : tail.split(':')
    const zerosNeeded = 8 - headParts.length - tailParts.length
    if (zerosNeeded < 0) return null
    parts = [...headParts, ...new Array(zerosNeeded).fill('0'), ...tailParts]
  }
  const out: number[] = []
  for (const p of parts) {
    if (!/^[0-9a-f]{1,4}$/.test(p)) return null
    out.push(parseInt(p, 16))
  }
  return out
}
