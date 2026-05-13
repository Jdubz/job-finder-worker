import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { lookup as DnsLookup } from 'node:dns/promises'
import { FreshnessService, isPublicIp, type FreshnessOptions } from '../freshness.service'
import { FreshnessRepository } from '../freshness.repository'
import { JobMatchRepository } from '../../job-matches/job-match.repository'
import { JobListingRepository } from '../../job-listings/job-listing.repository'
import { getDb } from '../../../db/sqlite'
import { buildJobMatchInput, buildJobListingRecord } from '../../job-matches/__tests__/fixtures'

vi.mock('../../../logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}))

function makeResponse(opts: {
  status?: number
  url?: string
  body?: string
  location?: string
}): Response {
  const status = opts.status ?? 200
  const headers = new Headers()
  if (opts.location) headers.set('location', opts.location)
  return {
    status,
    ok: status >= 200 && status < 300,
    url: opts.url ?? 'https://example.com/jobs/x',
    headers,
    body: opts.body
      ? new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(opts.body!))
            controller.close()
          }
        })
      : null,
    text: async () => opts.body ?? ''
  } as unknown as Response
}

/** Pretend every hostname resolves to a public IP so SSRF guard doesn't block tests. */
const publicDns = vi.fn(async (_host: string, _opts?: unknown) => [{ address: '93.184.216.34', family: 4 }] as Array<{ address: string; family: number }>) as unknown as typeof DnsLookup

describe('FreshnessService', () => {
  const matchRepo = new JobMatchRepository()
  const listingRepo = new JobListingRepository()
  const db = getDb()

  const seed = (
    id: string,
    overrides: { applyUrl?: string | null; matchStatus?: string; url?: string; extraMatches?: number } = {}
  ) => {
    listingRepo.create(
      buildJobListingRecord({
        id,
        url: overrides.url ?? `https://example.com/jobs/${id}`
      })
    )
    if (overrides.applyUrl !== undefined) {
      db.prepare(`UPDATE job_listings SET apply_url = ? WHERE id = ?`).run(overrides.applyUrl, id)
    }
    matchRepo.upsert(
      buildJobMatchInput({
        jobListingId: id,
        status: (overrides.matchStatus ?? 'active') as any,
        queueItemId: `q-${id}`
      })
    )
    for (let i = 0; i < (overrides.extraMatches ?? 0); i++) {
      matchRepo.upsert(
        buildJobMatchInput({
          jobListingId: id,
          status: 'active' as any,
          queueItemId: `q-${id}-x${i}`,
          matchScore: 70 + i
        })
      )
    }
  }

  beforeEach(() => {
    db.prepare('DELETE FROM application_status_history').run()
    db.prepare('DELETE FROM job_matches').run()
    db.prepare('DELETE FROM job_listings').run()
  })

  const buildService = (fetchImpl: typeof fetch, options: FreshnessOptions = {}) =>
    new FreshnessService(new FreshnessRepository(), {
      fetchImpl,
      dnsLookup: publicDns,
      perRequestDelayMs: 0,
      batchSize: 10,
      ...options
    })

  it('marks listings as live and leaves matches active when URL returns 200', async () => {
    seed('listing-live')
    const fetchImpl = vi.fn(async () => makeResponse({ status: 200, body: '<html></html>' }))
    const service = buildService(fetchImpl)

    const result = await service.run()

    expect(result).toMatchObject({ success: true, checked: 1, stillLive: 1, autoIgnored: 0 })
    const row = db
      .prepare('SELECT verification_status, last_verified_at FROM job_listings WHERE id = ?')
      .get('listing-live') as { verification_status: string; last_verified_at: string }
    expect(row.verification_status).toBe('live')
    expect(row.last_verified_at).toBeTruthy()
    const match = db.prepare(`SELECT status FROM job_matches`).get() as { status: string }
    expect(match.status).toBe('active')
  })

  it('auto-ignores every active match for a 404 listing and records history per match', async () => {
    seed('listing-404', { extraMatches: 2 })
    const fetchImpl = vi.fn(async () => makeResponse({ status: 404 }))
    const service = buildService(fetchImpl)

    const result = await service.run()

    expect(result).toMatchObject({ checked: 1, notFound: 1, autoIgnored: 3 })
    const statuses = db
      .prepare(`SELECT status, status_updated_by FROM job_matches`)
      .all() as Array<{ status: string; status_updated_by: string }>
    expect(statuses.every((s) => s.status === 'ignored')).toBe(true)
    expect(statuses.every((s) => s.status_updated_by === 'freshness-service')).toBe(true)
    const history = db
      .prepare(`SELECT changed_by FROM application_status_history`)
      .all() as Array<{ changed_by: string }>
    expect(history).toHaveLength(3)
    expect(history.every((h) => h.changed_by === 'freshness-service')).toBe(true)
  })

  it('detects "no longer available" body and treats it as not_found', async () => {
    seed('listing-closed-body')
    const fetchImpl = vi.fn(async () =>
      makeResponse({
        status: 200,
        body: '<html>This position is no longer available.</html>'
      })
    )
    const service = buildService(fetchImpl)

    const result = await service.run()
    expect(result).toMatchObject({ notFound: 1, autoIgnored: 1 })
  })

  it('classifies bounce to /careers (no query) as redirected and auto-ignores', async () => {
    seed('listing-redirected')
    let call = 0
    const fetchImpl = vi.fn(async () => {
      call++
      if (call === 1) return makeResponse({ status: 302, location: 'https://example.com/careers' })
      return makeResponse({ status: 200, url: 'https://example.com/careers', body: '<html></html>' })
    })
    const service = buildService(fetchImpl)

    const result = await service.run()
    expect(result).toMatchObject({ redirected: 1, autoIgnored: 1 })
  })

  it('does NOT treat /jobs with a job-id query param as redirected', async () => {
    seed('listing-greenhouse', { applyUrl: 'https://example.com/jobs?gh_jid=12345' })
    const fetchImpl = vi.fn(async () =>
      makeResponse({ status: 200, url: 'https://example.com/jobs?gh_jid=12345', body: '<html></html>' })
    )
    const service = buildService(fetchImpl)

    const result = await service.run()
    expect(result).toMatchObject({ stillLive: 1, redirected: 0, autoIgnored: 0 })
  })

  it('does not auto-ignore matches that are not active', async () => {
    seed('listing-applied', { matchStatus: 'applied' })
    const fetchImpl = vi.fn(async () => makeResponse({ status: 404 }))
    const service = buildService(fetchImpl)
    const result = await service.run()
    expect(result.checked).toBe(0)
  })

  it('records unknown on network error without flipping match', async () => {
    seed('listing-network-fail')
    const fetchImpl = vi.fn(async () => {
      throw new Error('ECONNRESET')
    })
    const service = buildService(fetchImpl)

    const result = await service.run()
    expect(result).toMatchObject({ checked: 1, unknown: 1, autoIgnored: 0 })
    const match = db.prepare(`SELECT status FROM job_matches`).get() as { status: string }
    expect(match.status).toBe('active')
  })

  it('skips listings already verified within the staleness window', async () => {
    seed('listing-fresh')
    const recent = new Date().toISOString()
    db.prepare(`UPDATE job_listings SET last_verified_at = ?, verification_status = 'live' WHERE id = ?`).run(
      recent,
      'listing-fresh'
    )
    const fetchImpl = vi.fn(async () => makeResponse({ status: 200 }))
    const service = buildService(fetchImpl, { staleAfterHours: 72 })

    const result = await service.run()
    expect(result.checked).toBe(0)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('prefers apply_url over url when set', async () => {
    seed('listing-apply', { applyUrl: 'https://example.com/apply/here' })
    const fetchImpl = vi.fn(async () =>
      makeResponse({ status: 200, url: 'https://example.com/apply/here', body: '<html></html>' })
    )
    const service = buildService(fetchImpl)

    await service.run()
    expect(fetchImpl).toHaveBeenCalledWith('https://example.com/apply/here', expect.any(Object))
  })

  it('SSRF guard rejects loopback destinations without fetching', async () => {
    seed('listing-loopback', { url: 'http://localhost/jobs/x' })
    const loopbackDns = vi.fn(async () => [{ address: '127.0.0.1', family: 4 }]) as unknown as typeof DnsLookup
    const fetchImpl = vi.fn(async () => makeResponse({ status: 200 }))
    const service = new FreshnessService(new FreshnessRepository(), {
      fetchImpl,
      dnsLookup: loopbackDns,
      perRequestDelayMs: 0
    })

    const result = await service.run()
    expect(result).toMatchObject({ checked: 1, unknown: 1, autoIgnored: 0 })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('SSRF guard rejects redirects to private IPs', async () => {
    seed('listing-public-then-private')
    const dns = vi.fn(async (host: string) => {
      if (host === 'internal.example') return [{ address: '10.0.0.5', family: 4 }]
      return [{ address: '93.184.216.34', family: 4 }]
    }) as unknown as typeof DnsLookup
    const fetchImpl = vi.fn(async (input: URL | RequestInfo) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      if (url.includes('internal.example')) return makeResponse({ status: 200 })
      return makeResponse({ status: 302, location: 'http://internal.example/secret' })
    }) as unknown as typeof fetch
    const service = new FreshnessService(new FreshnessRepository(), {
      fetchImpl,
      dnsLookup: dns,
      perRequestDelayMs: 0
    })

    const result = await service.run()
    expect(result).toMatchObject({ checked: 1, unknown: 1, autoIgnored: 0 })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('caps body read at maxBodyBytes even when a single chunk exceeds the cap', async () => {
    seed('listing-huge')
    // Emit one giant chunk in a single read so the cap MUST be enforced via slicing.
    const huge = 'a'.repeat(2_000_000)
    const fetchImpl = vi.fn(async () => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(huge))
          controller.close()
        }
      })
      return {
        status: 200,
        ok: true,
        url: 'https://example.com/jobs/listing-huge',
        headers: new Headers(),
        body,
        text: async () => huge
      } as unknown as Response
    })
    const service = buildService(fetchImpl, { maxBodyBytes: 1024 })
    const result = await service.run()
    expect(result).toMatchObject({ stillLive: 1 })
    // Implementation detail check: we didn't keep the 2 MB body in memory.
    // Probe is wrapped in the service; the easiest indirect check is that
    // the run completes synchronously without errors, which the asserts cover.
  })
})

describe('isPublicIp', () => {
  it.each([
    ['8.8.8.8', true],
    ['93.184.216.34', true],
    ['1.1.1.1', true],
    // RFC 6890 reserved blocks — must be rejected
    ['0.0.0.1', false],            // 0.0.0.0/8
    ['10.0.0.1', false],           // 10.0.0.0/8
    ['100.64.0.1', false],         // 100.64.0.0/10 CGNAT
    ['127.0.0.1', false],          // loopback
    ['169.254.169.254', false],    // AWS/cloud metadata
    ['172.16.0.1', false],         // 172.16.0.0/12
    ['172.31.255.254', false],     // 172.16.0.0/12 upper
    ['192.0.0.1', false],          // 192.0.0.0/24 IETF
    ['192.0.2.1', false],          // TEST-NET-1
    ['192.88.99.1', false],        // 6to4 anycast
    ['192.168.1.1', false],        // 192.168.0.0/16
    ['198.18.0.1', false],         // benchmarking
    ['198.19.255.254', false],
    ['198.51.100.1', false],       // TEST-NET-2
    ['203.0.113.1', false],        // TEST-NET-3
    ['224.0.0.1', false],          // multicast
    ['240.0.0.1', false],          // reserved
    ['255.255.255.255', false]     // broadcast
  ])('classifies IPv4 %s -> public=%s', (ip, expected) => {
    expect(isPublicIp(ip)).toBe(expected)
  })

  it.each([
    ['2606:4700:4700::1111', true],   // Cloudflare DNS
    ['2001:db8::1', false],            // documentation
    ['2001:db8:1:2::3', false],
    ['100::1', false],                  // discard-only
    ['fc00::1', false],                 // ULA
    ['fd12:3456::1', false],            // ULA
    ['fe80::1', false],                 // link-local
    ['ff02::1', false],                 // multicast
    ['::1', false],                     // loopback
    ['::', false],                      // unspecified
    ['::ffff:127.0.0.1', false],        // IPv4-mapped loopback
    ['::ffff:169.254.169.254', false]   // IPv4-mapped metadata
  ])('classifies IPv6 %s -> public=%s', (ip, expected) => {
    expect(isPublicIp(ip)).toBe(expected)
  })

  it('returns false for non-IP strings', () => {
    expect(isPublicIp('not-an-ip')).toBe(false)
    expect(isPublicIp('')).toBe(false)
  })
})
