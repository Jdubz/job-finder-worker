import { beforeEach, describe, expect, it } from 'vitest'
import type { FreshnessConfig } from '@shared/types'
import {
  computeLiveFreshnessAdjustment,
  clampScore,
  clearFreshnessConfigCache,
  loadFreshnessConfig
} from '../freshness-scorer'
import { ConfigRepository } from '../../config/config.repository'
import { getDb } from '../../../db/sqlite'

const baseConfig: FreshnessConfig = {
  freshDays: 3,
  freshScore: 10,
  staleDays: 7,
  staleScore: -10,
  veryStaleDays: 14,
  veryStaleScore: -20,
  repostScore: -5
}

const NOW = new Date('2026-05-14T12:00:00Z')
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000)

describe('computeLiveFreshnessAdjustment', () => {
  it('returns freshScore inside the freshness window', () => {
    expect(computeLiveFreshnessAdjustment(daysAgo(0), baseConfig, NOW)).toBe(10)
    expect(computeLiveFreshnessAdjustment(daysAgo(3), baseConfig, NOW)).toBe(10)
  })

  it('returns 0 between freshDays and staleDays', () => {
    expect(computeLiveFreshnessAdjustment(daysAgo(4), baseConfig, NOW)).toBe(0)
    expect(computeLiveFreshnessAdjustment(daysAgo(6.5), baseConfig, NOW)).toBe(0)
  })

  it('returns staleScore at staleDays threshold', () => {
    expect(computeLiveFreshnessAdjustment(daysAgo(7), baseConfig, NOW)).toBe(-10)
    expect(computeLiveFreshnessAdjustment(daysAgo(13), baseConfig, NOW)).toBe(-10)
  })

  it('returns veryStaleScore at veryStaleDays threshold', () => {
    expect(computeLiveFreshnessAdjustment(daysAgo(14), baseConfig, NOW)).toBe(-20)
    expect(computeLiveFreshnessAdjustment(daysAgo(60), baseConfig, NOW)).toBe(-20)
  })

  it('returns 0 for null / undefined / unparseable', () => {
    expect(computeLiveFreshnessAdjustment(null, baseConfig, NOW)).toBe(0)
    expect(computeLiveFreshnessAdjustment(undefined, baseConfig, NOW)).toBe(0)
    expect(computeLiveFreshnessAdjustment('not-a-date', baseConfig, NOW)).toBe(0)
  })

  it('accepts ISO strings', () => {
    expect(computeLiveFreshnessAdjustment(daysAgo(2).toISOString(), baseConfig, NOW)).toBe(10)
  })

  it('accepts Firestore-style {seconds} timestamps', () => {
    const seconds = Math.floor(daysAgo(20).getTime() / 1000)
    expect(computeLiveFreshnessAdjustment({ seconds } as unknown as Date, baseConfig, NOW)).toBe(-20)
  })
})

describe('clampScore', () => {
  it('clamps to [0,100] and rounds', () => {
    expect(clampScore(-5)).toBe(0)
    expect(clampScore(150)).toBe(100)
    expect(clampScore(72.4)).toBe(72)
    expect(clampScore(NaN)).toBe(0)
  })
})

describe('loadFreshnessConfig', () => {
  beforeEach(() => {
    clearFreshnessConfigCache()
    const db = getDb()
    db.prepare("DELETE FROM job_finder_config WHERE id = 'match-policy'").run()
  })

  it('returns null when match-policy is not seeded', () => {
    expect(loadFreshnessConfig(new ConfigRepository())).toBeNull()
  })

  it('returns the freshness section when match-policy exists', () => {
    new ConfigRepository().upsert('match-policy', {
      minScore: 65,
      seniority: { preferred: [], acceptable: [], rejected: [], preferredScore: 0, acceptableScore: 0, rejectedScore: 0 },
      location: { allowRemote: true, allowHybrid: true, allowOnsite: false, userTimezone: -8, maxTimezoneDiffHours: 4, perHourScore: -1, hybridSameCityScore: 0, userCity: '', remoteScore: 0, relocationScore: 0, unknownTimezoneScore: 0, relocationAllowed: false },
      skillMatch: { baseMatchScore: 2, yearsMultiplier: 0.5, maxYearsBonus: 5, missingScore: -2, missingIgnore: [], analogScore: 0, maxBonus: 25, maxPenalty: -15 },
      salary: { minimum: 100000, target: 150000, belowTargetScore: -2, belowTargetMaxPenalty: -20, missingSalaryScore: 0, meetsTargetScore: 5, equityScore: 5, contractScore: -15 },
      freshness: baseConfig,
      roleFit: { preferred: [], acceptable: [], penalized: [], rejected: [], preferredScore: 0, penalizedScore: 0 },
      company: { preferredCityScore: 0, preferredCity: '', remoteFirstScore: 0, aiMlFocusScore: 0, largeCompanyScore: 0, smallCompanyScore: 0, largeCompanyThreshold: 10000, smallCompanyThreshold: 100, startupScore: 0 },
      experience: {}
    } as unknown as Parameters<ConfigRepository['upsert']>[1], { updatedBy: 'test' })

    const loaded = loadFreshnessConfig(new ConfigRepository())
    expect(loaded).toEqual(baseConfig)
  })
})
