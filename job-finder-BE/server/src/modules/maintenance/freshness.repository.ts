import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import { getDb } from '../../db/sqlite'

export type VerificationStatus = 'live' | 'not_found' | 'redirected' | 'unknown'

export interface ListingToVerify {
  id: string
  url: string
  applyUrl: string | null
  companyName: string
}

export class FreshnessRepository {
  private db: Database.Database

  constructor() {
    this.db = getDb()
  }

  /**
   * Find listings that need re-verification. A listing is selected if:
   *  - it has at least one job_match with status='active' (the only state we'll auto-flip), and
   *  - it has never been verified, or was last verified before `cutoffIso`.
   *
   * Returns one row per candidate listing. Auto-ignore later applies to every
   * active match for the listing, not just the top one — see autoIgnoreActiveMatchesForListing.
   */
  selectListingsToVerify(cutoffIso: string, limit: number): ListingToVerify[] {
    const rows = this.db
      .prepare(
        `
        SELECT l.id, l.url, l.apply_url, l.company_name
        FROM job_listings l
        WHERE (l.last_verified_at IS NULL OR l.last_verified_at < ?)
          AND EXISTS (
            SELECT 1 FROM job_matches m
            WHERE m.job_listing_id = l.id AND m.status = 'active'
          )
        ORDER BY COALESCE(l.last_verified_at, '0000') ASC
        LIMIT ?
        `
      )
      .all(cutoffIso, limit) as Array<{
      id: string
      url: string
      apply_url: string | null
      company_name: string
    }>

    return rows.map((row) => ({
      id: row.id,
      url: row.url,
      applyUrl: row.apply_url,
      companyName: row.company_name
    }))
  }

  recordVerification(listingId: string, status: VerificationStatus, atIso: string): void {
    this.db
      .prepare(
        `UPDATE job_listings
            SET last_verified_at = ?, verification_status = ?, updated_at = ?
          WHERE id = ?`
      )
      .run(atIso, status, atIso, listingId)
  }

  /**
   * Flip every `active` job_match for a listing to `ignored` because the
   * underlying listing is no longer live. Writes one application_status_history
   * row per flipped match so the change is auditable. Returns the count of
   * rows actually flipped (zero if no matches were active anymore).
   */
  autoIgnoreActiveMatchesForListing(listingId: string, note: string, atIso: string): number {
    return this.db.transaction(() => {
      const active = this.db
        .prepare(`SELECT id FROM job_matches WHERE job_listing_id = ? AND status = 'active'`)
        .all(listingId) as Array<{ id: string }>

      if (active.length === 0) return 0

      const updateMatch = this.db.prepare(
        `UPDATE job_matches
            SET status = 'ignored',
                ignored_at = ?,
                status_note = ?,
                status_updated_by = 'freshness-service',
                updated_at = ?
          WHERE id = ? AND status = 'active'`
      )
      const insertHistory = this.db.prepare(
        `INSERT INTO application_status_history
           (id, job_match_id, from_status, to_status, changed_by, application_email_id, note, created_at)
         VALUES (?, ?, 'active', 'ignored', 'freshness-service', NULL, ?, ?)`
      )

      let flipped = 0
      for (const row of active) {
        const result = updateMatch.run(atIso, note, atIso, row.id)
        if (result.changes > 0) {
          insertHistory.run(randomUUID(), row.id, note, atIso)
          flipped++
        }
      }
      return flipped
    })()
  }
}
