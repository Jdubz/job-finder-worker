import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FreshnessService } from '../freshness.service'
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
}): Response {
  const status = opts.status ?? 200
  return {
    status,
    ok: status >= 200 && status < 300,
    url: opts.url ?? 'https://example.com/jobs/x',
    text: async () => opts.body ?? '<html><body>Apply here</body></html>',
    headers: new Headers()
  } as unknown as Response
}

describe('FreshnessService', () => {
  const matchRepo = new JobMatchRepository()
  const listingRepo = new JobListingRepository()
  const db = getDb()

  const seed = (
    id: string,
    overrides: { applyUrl?: string | null; matchStatus?: string } = {}
  ) => {
    listingRepo.create(
      buildJobListingRecord({
        id,
        url: `https://example.com/jobs/${id}`
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
  }

  beforeEach(() => {
    db.prepare('DELETE FROM application_status_history').run()
    db.prepare('DELETE FROM job_matches').run()
    db.prepare('DELETE FROM job_listings').run()
  })

  it('marks listings as live and leaves matches active when URL returns 200', async () => {
    seed('listing-live')
    const fetchImpl = vi.fn(async () => makeResponse({ status: 200 }))
    const service = new FreshnessService(new FreshnessRepository(), {
      fetchImpl,
      perRequestDelayMs: 0,
      batchSize: 10
    })

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

  it('auto-ignores active matches when listing returns 404 and records history', async () => {
    seed('listing-404')
    const fetchImpl = vi.fn(async () => makeResponse({ status: 404 }))
    const service = new FreshnessService(new FreshnessRepository(), {
      fetchImpl,
      perRequestDelayMs: 0
    })

    const result = await service.run()

    expect(result).toMatchObject({ checked: 1, notFound: 1, autoIgnored: 1 })
    const match = db
      .prepare(`SELECT status, status_note, status_updated_by FROM job_matches`)
      .get() as { status: string; status_note: string; status_updated_by: string }
    expect(match.status).toBe('ignored')
    expect(match.status_updated_by).toBe('freshness-service')
    expect(match.status_note).toMatch(/not_found/)
    const history = db
      .prepare(`SELECT from_status, to_status, changed_by FROM application_status_history`)
      .get() as { from_status: string; to_status: string; changed_by: string }
    expect(history).toEqual({ from_status: 'active', to_status: 'ignored', changed_by: 'email_tracker' })
  })

  it('detects "no longer accepting applications" body and treats it as not_found', async () => {
    seed('listing-closed-body')
    const fetchImpl = vi.fn(async () =>
      makeResponse({
        status: 200,
        body: '<html>This position is no longer available.</html>'
      })
    )
    const service = new FreshnessService(new FreshnessRepository(), {
      fetchImpl,
      perRequestDelayMs: 0
    })

    const result = await service.run()
    expect(result).toMatchObject({ notFound: 1, autoIgnored: 1 })
  })

  it('treats redirect to /careers as redirected and auto-ignores', async () => {
    seed('listing-redirected')
    const fetchImpl = vi.fn(async () =>
      makeResponse({ status: 200, url: 'https://example.com/careers' })
    )
    const service = new FreshnessService(new FreshnessRepository(), {
      fetchImpl,
      perRequestDelayMs: 0
    })

    const result = await service.run()
    expect(result).toMatchObject({ redirected: 1, autoIgnored: 1 })
  })

  it('does not auto-ignore matches that are not active', async () => {
    seed('listing-applied', { matchStatus: 'applied' })
    const fetchImpl = vi.fn(async () => makeResponse({ status: 404 }))
    const service = new FreshnessService(new FreshnessRepository(), {
      fetchImpl,
      perRequestDelayMs: 0
    })

    // selectListingsToVerify only joins to active matches, so the 'applied'
    // listing should not even be picked up.
    const result = await service.run()
    expect(result.checked).toBe(0)
  })

  it('records unknown on network error without flipping match', async () => {
    seed('listing-network-fail')
    const fetchImpl = vi.fn(async () => {
      throw new Error('ECONNRESET')
    })
    const service = new FreshnessService(new FreshnessRepository(), {
      fetchImpl,
      perRequestDelayMs: 0
    })

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
    const service = new FreshnessService(new FreshnessRepository(), {
      fetchImpl,
      perRequestDelayMs: 0,
      staleAfterHours: 72
    })

    const result = await service.run()
    expect(result.checked).toBe(0)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('prefers apply_url over url when set', async () => {
    seed('listing-apply', { applyUrl: 'https://example.com/apply/here' })
    const fetchImpl = vi.fn(async () => makeResponse({ status: 200, url: 'https://example.com/apply/here' }))
    const service = new FreshnessService(new FreshnessRepository(), {
      fetchImpl,
      perRequestDelayMs: 0
    })

    await service.run()
    expect(fetchImpl).toHaveBeenCalledWith('https://example.com/apply/here', expect.any(Object))
  })
})
