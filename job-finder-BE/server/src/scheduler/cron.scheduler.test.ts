import { describe, it, expect, vi } from 'vitest'
import type { CronConfig } from '@shared/types'
import { __cronTestInternals as cronTest } from './cron'

const baseConfig: CronConfig = {
  jobs: {
    scrape: { enabled: true, hours: [0, 6, 12], lastRun: null },
    maintenance: { enabled: true, hours: [3], lastRun: null },
    logrotate: { enabled: true, hours: [3], lastRun: null },
    agentReset: { enabled: true, hours: [0], lastRun: null },
    gmailIngest: { enabled: true, hours: [1, 7, 13, 19], lastRun: null }
  }
}

describe('cron scheduler logic', () => {
  it('normalizeHours sorts, dedupes, and drops invalid entries', () => {
    const result = cronTest.normalizeHours([23, 1, 1, -1, 24, 12])
    expect(result).toEqual([1, 12, 23])
  })

  it('buildHourKey and hourKeyFromIso align to yyyy-m-d-h format', () => {
    const now = new Date(2025, 1, 1, 8, 30) // local time
    expect(cronTest.buildHourKey(now)).toBe('2025-2-1-8')
    expect(cronTest.hourKeyFromIso(now.toISOString())).toBe('2025-2-1-8')
  })

  it('runs a job once per listed hour and records lastRun', async () => {
    const actions = {
      scrape: vi.fn().mockResolvedValue({}),
      maintenance: vi.fn(),
      logrotate: vi.fn(),
      agentReset: vi.fn(),
      gmailIngest: vi.fn()
    }

    const config: CronConfig = JSON.parse(JSON.stringify(baseConfig))
    const state = { scrape: null, maintenance: null, logrotate: null, agentReset: null, gmailIngest: null }
    const now = new Date(2025, 1, 1, 6, 5)

    const first = await cronTest.maybeRunJobWithState('scrape', config, now, state, actions)
    const second = await cronTest.maybeRunJobWithState('scrape', config, now, state, actions)

    expect(first).toBe(true)
    expect(second).toBe(false)
    expect(actions.scrape).toHaveBeenCalledTimes(1)
    expect(config.jobs.scrape.lastRun).toBe(now.toISOString())
    expect(state.scrape).toBe('2025-2-1-6')
  })

  it('skips disabled jobs even when hour matches', async () => {
    const actions = {
      scrape: vi.fn(),
      maintenance: vi.fn(),
      logrotate: vi.fn(),
      agentReset: vi.fn(),
      gmailIngest: vi.fn()
    }
    const config: CronConfig = JSON.parse(JSON.stringify(baseConfig))
    config.jobs.maintenance.enabled = false
    const state = { scrape: null, maintenance: null, logrotate: null, agentReset: null, gmailIngest: null }
    const now = new Date('2025-02-01T03:00:00Z')

    const ran = await cronTest.maybeRunJobWithState('maintenance', config, now, state, actions)
    expect(ran).toBe(false)
    expect(actions.maintenance).not.toHaveBeenCalled()
    expect(config.jobs.maintenance.lastRun).toBeNull()
  })

  it('runs again on a later hour in hours list', async () => {
    const actions = {
      scrape: vi.fn().mockResolvedValue({}),
      maintenance: vi.fn(),
      logrotate: vi.fn(),
      agentReset: vi.fn(),
      gmailIngest: vi.fn()
    }
    const config: CronConfig = JSON.parse(JSON.stringify(baseConfig))
    const state = { scrape: null, maintenance: null, logrotate: null, agentReset: null, gmailIngest: null }

    const sixAm = new Date(2025, 1, 1, 6, 0)
    const noon = new Date(2025, 1, 1, 12, 0)

    await cronTest.maybeRunJobWithState('scrape', config, sixAm, state, actions)
    const ranAgain = await cronTest.maybeRunJobWithState('scrape', config, noon, state, actions)

    expect(actions.scrape).toHaveBeenCalledTimes(2)
    expect(ranAgain).toBe(true)
    expect(config.jobs.scrape.lastRun).toBe(noon.toISOString())
    expect(state.scrape).toBe('2025-2-1-12')
  })
})
