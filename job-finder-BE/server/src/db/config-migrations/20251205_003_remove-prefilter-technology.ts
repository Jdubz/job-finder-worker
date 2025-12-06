/**
 * Migration: Remove technology field from prefilter-policy
 *
 * The technology reject list has been removed from the prefilter.
 * Frontend positions mentioning backend technologies should not be rejected.
 * Technology filtering is now handled only in the scoring/match phase.
 */

import type Database from 'better-sqlite3'

export const description = 'Remove technology field from prefilter-policy'

type PrefilterPolicy = {
  title: { requiredKeywords: string[]; excludedKeywords: string[] }
  freshness: { maxAgeDays: number }
  workArrangement: {
    allowRemote: boolean
    allowHybrid: boolean
    allowOnsite: boolean
    willRelocate: boolean
    userLocation: string
    maxTimezoneDiffHours?: number
  }
  employmentType: { allowFullTime: boolean; allowPartTime: boolean; allowContract: boolean }
  salary: { minimum: number | null }
  technology?: { rejected: string[] }
}

export function up(db: Database.Database): void {
  const row = db
    .prepare('SELECT payload_json FROM job_finder_config WHERE id = ?')
    .get('prefilter-policy') as { payload_json: string } | undefined

  if (!row) {
    // No prefilter-policy config exists, nothing to migrate
    return
  }

  const parsed = JSON.parse(row.payload_json) as PrefilterPolicy

  if (!('technology' in parsed)) {
    // Already migrated, nothing to do
    return
  }

  // Remove the technology field
  const { technology: _removed, ...rest } = parsed

  db.prepare(
    `UPDATE job_finder_config SET payload_json = ?, updated_at = ?, updated_by = ? WHERE id = ?`
  ).run(JSON.stringify(rest), new Date().toISOString(), 'config-migration', 'prefilter-policy')
}

export function down(db: Database.Database): void {
  const row = db
    .prepare('SELECT payload_json FROM job_finder_config WHERE id = ?')
    .get('prefilter-policy') as { payload_json: string } | undefined

  if (!row) return

  const parsed = JSON.parse(row.payload_json) as PrefilterPolicy

  if ('technology' in parsed) {
    // Already has technology field, nothing to rollback
    return
  }

  // Add back the technology field with empty rejected list
  const withTechnology = {
    ...parsed,
    technology: { rejected: [] },
  }

  db.prepare(
    `UPDATE job_finder_config SET payload_json = ?, updated_at = ?, updated_by = ? WHERE id = ?`
  ).run(JSON.stringify(withTechnology), new Date().toISOString(), 'config-migration-rollback', 'prefilter-policy')
}
