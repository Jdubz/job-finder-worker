/**
 * Live freshness adjustment for match scores.
 *
 * The deterministic ScoringEngine in the worker bakes a freshness component
 * into the match score at analyze-time. That's a snapshot — a listing posted
 * a day ago and scored "fresh" (+10) keeps that bonus forever even after it
 * goes stale. The worker now stores a `static_score` (score minus freshness)
 * so this module can recompute the freshness adjustment using the listing's
 * actual age relative to NOW.
 *
 * Mirrors `_score_freshness` in `scoring/engine.py`:
 *   - days_old <= freshDays     -> +freshScore
 *   - days_old >= veryStaleDays -> +veryStaleScore (typically negative)
 *   - days_old >= staleDays     -> +staleScore     (typically negative)
 *   - in between                -> 0
 * (Repost penalty is intentionally not modeled here; it's a one-time signal
 *  from extraction, not a function of elapsed time.)
 */

import type { FreshnessConfig, MatchPolicy } from '@shared/types'
import { ConfigRepository } from '../config/config.repository'

const CACHE_TTL_MS = 60_000

let cached: { config: FreshnessConfig; loadedAt: number } | null = null

/**
 * Load the freshness portion of match-policy with a short in-process cache so
 * read-heavy match list endpoints don't hammer the config repository.
 */
export function loadFreshnessConfig(repo: ConfigRepository = new ConfigRepository()): FreshnessConfig | null {
  const now = Date.now()
  if (cached && now - cached.loadedAt < CACHE_TTL_MS) return cached.config

  const entry = repo.get<MatchPolicy>('match-policy')
  const freshness = entry?.payload?.freshness
  if (!freshness) {
    cached = null
    return null
  }
  cached = { config: freshness, loadedAt: now }
  return freshness
}

/** Drop the in-process cache. Useful for tests and for clearing after config edits. */
export function clearFreshnessConfigCache(): void {
  cached = null
}

/** Pure function — given a snapshot of the freshness policy and timestamps, return the adjustment. */
export function computeLiveFreshnessAdjustment(
  reference: Date | string | { seconds?: number; _seconds?: number } | null | undefined,
  config: FreshnessConfig,
  now: Date = new Date()
): number {
  if (!reference) return 0
  let ts: Date
  if (reference instanceof Date) {
    ts = reference
  } else if (typeof reference === 'string') {
    ts = new Date(reference)
  } else if (typeof reference === 'object') {
    const seconds = (reference as { seconds?: number; _seconds?: number }).seconds ??
      (reference as { seconds?: number; _seconds?: number })._seconds
    if (typeof seconds !== 'number') return 0
    ts = new Date(seconds * 1000)
  } else {
    return 0
  }
  if (Number.isNaN(ts.getTime())) return 0

  const days = Math.max(0, (now.getTime() - ts.getTime()) / (24 * 60 * 60 * 1000))
  if (days <= config.freshDays) return config.freshScore
  if (days >= config.veryStaleDays) return config.veryStaleScore
  if (days >= config.staleDays) return config.staleScore
  return 0
}

/** Clamp the final live-adjusted score to the same 0..100 range the engine uses. */
export function clampScore(score: number): number {
  if (Number.isNaN(score)) return 0
  if (score < 0) return 0
  if (score > 100) return 100
  return Math.round(score)
}
