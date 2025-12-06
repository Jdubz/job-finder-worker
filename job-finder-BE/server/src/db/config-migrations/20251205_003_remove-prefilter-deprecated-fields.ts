/**
 * Migration: Remove deprecated fields (technology, userTimezone) from prefilter-policy
 *
 * The technology reject list and userTimezone have been removed from the prefilter.
 * - Frontend positions mentioning backend technologies should not be rejected.
 * - Timezone is now derived from userLocation city, not an explicit offset.
 * Technology filtering is now handled only in the scoring/match phase.
 */

import type Database from 'better-sqlite3'

export const description = 'Remove deprecated fields (technology, userTimezone) from prefilter-policy'

type WorkArrangementWithLegacy = {
  allowRemote: boolean
  allowHybrid: boolean
  allowOnsite: boolean
  willRelocate: boolean
  userLocation: string
  maxTimezoneDiffHours?: number
  userTimezone?: number  // Legacy field to be removed
}

type PrefilterPolicy = {
  title: { requiredKeywords: string[]; excludedKeywords: string[] }
  freshness: { maxAgeDays: number }
  workArrangement: WorkArrangementWithLegacy
  employmentType: { allowFullTime: boolean; allowPartTime: boolean; allowContract: boolean }
  salary: { minimum: number | null }
  technology?: { rejected: string[] }  // Legacy field to be removed
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

  const hasTechnology = 'technology' in parsed
  const hasUserTimezone = 'userTimezone' in (parsed.workArrangement || {})

  if (!hasTechnology && !hasUserTimezone) {
    // Already migrated, nothing to do
    return
  }

  // Remove the technology field
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { technology: _removedTech, ...restConfig } = parsed

  // Remove userTimezone from workArrangement
  if (hasUserTimezone) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { userTimezone: _removedTz, ...restWorkArrangement } = restConfig.workArrangement
    restConfig.workArrangement = restWorkArrangement as WorkArrangementWithLegacy
  }

  db.prepare(
    `UPDATE job_finder_config SET payload_json = ?, updated_at = ?, updated_by = ? WHERE id = ?`
  ).run(JSON.stringify(restConfig), new Date().toISOString(), 'config-migration', 'prefilter-policy')
}

export function down(db: Database.Database): void {
  const row = db
    .prepare('SELECT payload_json FROM job_finder_config WHERE id = ?')
    .get('prefilter-policy') as { payload_json: string } | undefined

  if (!row) return

  const parsed = JSON.parse(row.payload_json) as PrefilterPolicy

  const hasTechnology = 'technology' in parsed
  const hasUserTimezone = 'userTimezone' in (parsed.workArrangement || {})

  if (hasTechnology && hasUserTimezone) {
    // Already has both fields, nothing to rollback
    return
  }

  // Add back the technology field with empty rejected list
  const restored: PrefilterPolicy = {
    ...parsed,
    technology: parsed.technology ?? { rejected: [] },
    workArrangement: {
      ...parsed.workArrangement,
      userTimezone: (parsed.workArrangement as WorkArrangementWithLegacy).userTimezone ?? 0,
    },
  }

  db.prepare(
    `UPDATE job_finder_config SET payload_json = ?, updated_at = ?, updated_by = ? WHERE id = ?`
  ).run(JSON.stringify(restored), new Date().toISOString(), 'config-migration-rollback', 'prefilter-policy')
}
