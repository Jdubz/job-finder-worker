/**
 * Migration: Normalize technology-ranks format
 *
 * Converts old numeric technology values to the new rank-based structure.
 * Old: { "python": 5 }
 * New: { "python": { rank: "ok", points: 5 } }
 */

import type Database from 'better-sqlite3'

export const description = 'Normalize technology-ranks to rank-based structure'

type TechRankValue = number | { rank?: string; points?: number; mentions?: number }
type NormalizedTech = { rank: 'required' | 'ok' | 'strike' | 'fail'; points?: number; mentions?: number }

interface OldTechRanks {
  technologies?: Record<string, TechRankValue>
  strikes?: Record<string, unknown>
  extractedFromJobs?: unknown
  version?: unknown
}

interface NewTechRanks {
  technologies: Record<string, NormalizedTech>
  strikes: { missingAllRequired: number; perBadTech: number }
  extractedFromJobs?: unknown
  version?: unknown
}

function isAlreadyMigrated(payload: OldTechRanks): boolean {
  const techs = payload.technologies ?? {}
  // Check if any value is still a raw number (old format)
  for (const value of Object.values(techs)) {
    if (typeof value === 'number') return false
    if (typeof value === 'object' && value !== null) {
      const rank = (value as { rank?: string }).rank
      if (typeof rank !== 'string' || !['required', 'ok', 'strike', 'fail'].includes(rank)) {
        return false
      }
    }
  }
  // Check strikes structure
  const strikes = payload.strikes as Record<string, unknown> | undefined
  if (strikes) {
    if (typeof strikes.missingAllRequired !== 'number' || typeof strikes.perBadTech !== 'number') {
      return false
    }
  }
  return true
}

function migrateToNew(old: OldTechRanks): NewTechRanks {
  const incomingTechs = old.technologies ?? {}
  const normalizedTechs: Record<string, NormalizedTech> = {}

  for (const [name, value] of Object.entries(incomingTechs)) {
    if (typeof value === 'number') {
      normalizedTechs[name] = { rank: 'ok', points: value }
      continue
    }
    if (typeof value === 'object' && value !== null) {
      const v = value as { rank?: string; points?: number; mentions?: number }
      const rank =
        typeof v.rank === 'string' && ['required', 'ok', 'strike', 'fail'].includes(v.rank)
          ? (v.rank as NormalizedTech['rank'])
          : 'ok'
      normalizedTechs[name] = {
        rank,
        ...(typeof v.points === 'number' ? { points: v.points } : {}),
        ...(typeof v.mentions === 'number' ? { mentions: v.mentions } : {}),
      }
    }
  }

  const strikes = (old.strikes ?? {}) as Record<string, unknown>
  const normalizedStrikes = {
    missingAllRequired: typeof strikes.missingAllRequired === 'number' ? strikes.missingAllRequired : 1,
    perBadTech: typeof strikes.perBadTech === 'number' ? strikes.perBadTech : 2,
  }

  return {
    technologies: normalizedTechs,
    strikes: normalizedStrikes,
    extractedFromJobs: old.extractedFromJobs,
    version: old.version,
  }
}

export function up(db: Database.Database): void {
  const row = db
    .prepare('SELECT payload_json FROM job_finder_config WHERE id = ?')
    .get('technology-ranks') as { payload_json: string } | undefined

  if (!row) {
    // No technology-ranks config exists, nothing to migrate
    return
  }

  const parsed = JSON.parse(row.payload_json) as OldTechRanks

  if (isAlreadyMigrated(parsed)) {
    // Already in new format
    return
  }

  const newPayload = migrateToNew(parsed)

  db.prepare(
    `UPDATE job_finder_config SET payload_json = ?, updated_at = ?, updated_by = ? WHERE id = ?`
  ).run(JSON.stringify(newPayload), new Date().toISOString(), 'config-migration', 'technology-ranks')
}

export function down(db: Database.Database): void {
  // Rollback: convert back to numeric format where possible
  const row = db
    .prepare('SELECT payload_json FROM job_finder_config WHERE id = ?')
    .get('technology-ranks') as { payload_json: string } | undefined

  if (!row) return

  const parsed = JSON.parse(row.payload_json) as NewTechRanks

  // Convert normalized techs back to numbers where we have points
  const oldTechs: Record<string, TechRankValue> = {}
  for (const [name, value] of Object.entries(parsed.technologies ?? {})) {
    if (value.points !== undefined) {
      oldTechs[name] = value.points
    } else {
      oldTechs[name] = value // Keep as object if no points
    }
  }

  const oldPayload: OldTechRanks = {
    technologies: oldTechs,
    strikes: parsed.strikes,
    extractedFromJobs: parsed.extractedFromJobs,
    version: parsed.version,
  }

  db.prepare(
    `UPDATE job_finder_config SET payload_json = ?, updated_at = ?, updated_by = ? WHERE id = ?`
  ).run(JSON.stringify(oldPayload), new Date().toISOString(), 'config-migration-rollback', 'technology-ranks')
}
