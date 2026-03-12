/**
 * Migration: Add country eligibility filter to prefilter-policy
 *
 * Remote jobs from non-US countries (Canada, Brazil, Argentina, etc.) are passing
 * through the pipeline because the prefilter's country check code exists but was
 * never wired into the config schema. This migration seeds the country section
 * with allowedCountries: ["us"] to activate the existing filtering logic.
 */

import type Database from 'better-sqlite3'

export const description = 'Add country eligibility filter (US only) to prefilter-policy'

type PrefilterPolicy = {
  country?: { allowedCountries: string[] }
  [key: string]: unknown
}

export function up(db: Database.Database): void {
  const row = db
    .prepare('SELECT payload_json FROM job_finder_config WHERE id = ?')
    .get('prefilter-policy') as { payload_json: string } | undefined

  if (row) {
    const parsed = JSON.parse(row.payload_json) as PrefilterPolicy
    if (!parsed.country) {
      parsed.country = { allowedCountries: ['us'] }

      db.prepare(
        'UPDATE job_finder_config SET payload_json = ?, updated_at = ?, updated_by = ? WHERE id = ?'
      ).run(JSON.stringify(parsed), new Date().toISOString(), 'config-migration', 'prefilter-policy')
    }
  }
}

export function down(db: Database.Database): void {
  const row = db
    .prepare('SELECT payload_json FROM job_finder_config WHERE id = ?')
    .get('prefilter-policy') as { payload_json: string } | undefined

  if (row) {
    const parsed = JSON.parse(row.payload_json) as PrefilterPolicy
    if (parsed.country) {
      delete parsed.country

      db.prepare(
        'UPDATE job_finder_config SET payload_json = ?, updated_at = ?, updated_by = ? WHERE id = ?'
      ).run(
        JSON.stringify(parsed),
        new Date().toISOString(),
        'config-migration-rollback',
        'prefilter-policy'
      )
    }
  }
}
