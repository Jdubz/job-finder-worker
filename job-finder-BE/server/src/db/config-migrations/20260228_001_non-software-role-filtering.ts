/**
 * Migration: Add non-software engineering discipline filters
 *
 * Non-software engineering roles (mechanical, electrical, civil, etc.) are passing
 * through the pipeline because:
 * 1. Title filter has "engineer" as required — "Mechanical Engineer" passes
 * 2. No role type exists for non-software disciplines
 *
 * This migration:
 * - Adds discipline-specific keywords to prefilter-policy excludedKeywords
 * - Adds "non-software" to match-policy roleFit.rejected (pairs with new
 *   "non-software" role type in extraction prompts)
 */

import type Database from 'better-sqlite3'

export const description = 'Add non-software engineering discipline filters to title and role fit'

type PrefilterPolicy = {
  title: { requiredKeywords: string[]; excludedKeywords: string[] }
  [key: string]: unknown
}

type MatchPolicy = {
  roleFit: {
    preferred: string[]
    acceptable: string[]
    penalized: string[]
    rejected: string[]
    preferredScore: number
    penalizedScore: number
  }
  [key: string]: unknown
}

const NON_SOFTWARE_DISCIPLINES = [
  'mechanical',
  'electrical',
  'civil',
  'structural',
  'chemical',
  'industrial',
  'manufacturing',
  'environmental',
  'biomedical',
  'petroleum',
  'nuclear',
  'materials',
  'geotechnical',
]

export function up(db: Database.Database): void {
  // 1. Add excluded title keywords to prefilter-policy
  const prefilterRow = db
    .prepare('SELECT payload_json FROM job_finder_config WHERE id = ?')
    .get('prefilter-policy') as { payload_json: string } | undefined

  if (prefilterRow) {
    const parsed = JSON.parse(prefilterRow.payload_json) as PrefilterPolicy
    const existing = new Set(parsed.title.excludedKeywords.map((k) => k.toLowerCase()))
    const toAdd = NON_SOFTWARE_DISCIPLINES.filter((k) => !existing.has(k))

    if (toAdd.length > 0) {
      parsed.title.excludedKeywords.push(...toAdd)

      db.prepare(
        'UPDATE job_finder_config SET payload_json = ?, updated_at = ?, updated_by = ? WHERE id = ?'
      ).run(JSON.stringify(parsed), new Date().toISOString(), 'config-migration', 'prefilter-policy')
    }
  }

  // 2. Add "non-software" to match-policy roleFit.rejected
  const matchRow = db
    .prepare('SELECT payload_json FROM job_finder_config WHERE id = ?')
    .get('match-policy') as { payload_json: string } | undefined

  if (matchRow) {
    const parsed = JSON.parse(matchRow.payload_json) as MatchPolicy
    const existing = new Set(parsed.roleFit.rejected.map((r) => r.toLowerCase()))

    if (!existing.has('non-software')) {
      parsed.roleFit.rejected.push('non-software')

      db.prepare(
        'UPDATE job_finder_config SET payload_json = ?, updated_at = ?, updated_by = ? WHERE id = ?'
      ).run(JSON.stringify(parsed), new Date().toISOString(), 'config-migration', 'match-policy')
    }
  }
}

export function down(db: Database.Database): void {
  // 1. Remove discipline keywords from prefilter-policy
  const prefilterRow = db
    .prepare('SELECT payload_json FROM job_finder_config WHERE id = ?')
    .get('prefilter-policy') as { payload_json: string } | undefined

  if (prefilterRow) {
    const parsed = JSON.parse(prefilterRow.payload_json) as PrefilterPolicy
    const toRemove = new Set(NON_SOFTWARE_DISCIPLINES)
    parsed.title.excludedKeywords = parsed.title.excludedKeywords.filter(
      (k) => !toRemove.has(k.toLowerCase())
    )

    db.prepare(
      'UPDATE job_finder_config SET payload_json = ?, updated_at = ?, updated_by = ? WHERE id = ?'
    ).run(
      JSON.stringify(parsed),
      new Date().toISOString(),
      'config-migration-rollback',
      'prefilter-policy'
    )
  }

  // 2. Remove "non-software" from match-policy roleFit.rejected
  const matchRow = db
    .prepare('SELECT payload_json FROM job_finder_config WHERE id = ?')
    .get('match-policy') as { payload_json: string } | undefined

  if (matchRow) {
    const parsed = JSON.parse(matchRow.payload_json) as MatchPolicy
    parsed.roleFit.rejected = parsed.roleFit.rejected.filter(
      (r) => r.toLowerCase() !== 'non-software'
    )

    db.prepare(
      'UPDATE job_finder_config SET payload_json = ?, updated_at = ?, updated_by = ? WHERE id = ?'
    ).run(
      JSON.stringify(parsed),
      new Date().toISOString(),
      'config-migration-rollback',
      'match-policy'
    )
  }
}
