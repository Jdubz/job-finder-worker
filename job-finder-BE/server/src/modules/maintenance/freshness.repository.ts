import type Database from 'better-sqlite3'
import { getDb } from '../../db/sqlite'

export type VerificationStatus = 'live' | 'not_found' | 'redirected' | 'unknown'

export interface ListingToVerify {
  id: string
  url: string
  applyUrl: string | null
  companyName: string
  matchId: string
  matchStatus: string
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
   * Returns one row per candidate listing (joined to the highest-score active match
   * so we have a match_id handy for auto-ignore writes).
   */
  selectListingsToVerify(cutoffIso: string, limit: number): ListingToVerify[] {
    const rows = this.db
      .prepare(
        `
        SELECT l.id, l.url, l.apply_url, l.company_name,
               m.id AS match_id, m.status AS match_status
        FROM job_listings l
        JOIN job_matches m
          ON m.job_listing_id = l.id
         AND m.id = (
           SELECT id FROM job_matches
           WHERE job_listing_id = l.id AND status = 'active'
           ORDER BY match_score DESC, analyzed_at DESC
           LIMIT 1
         )
        WHERE (l.last_verified_at IS NULL OR l.last_verified_at < ?)
        ORDER BY COALESCE(l.last_verified_at, '0000') ASC
        LIMIT ?
        `
      )
      .all(cutoffIso, limit) as Array<{
      id: string
      url: string
      apply_url: string | null
      company_name: string
      match_id: string
      match_status: string
    }>

    return rows.map((row) => ({
      id: row.id,
      url: row.url,
      applyUrl: row.apply_url,
      companyName: row.company_name,
      matchId: row.match_id,
      matchStatus: row.match_status
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
   * Flip an `active` job_match to `ignored` because the underlying listing is no
   * longer live. Writes an application_status_history row so the change is
   * auditable. No-op if the match is no longer `active`.
   */
  autoIgnoreMatch(matchId: string, note: string, atIso: string, historyId: string): boolean {
    const result = this.db.transaction(() => {
      const current = this.db
        .prepare(`SELECT status FROM job_matches WHERE id = ?`)
        .get(matchId) as { status: string } | undefined
      if (!current || current.status !== 'active') return false

      this.db
        .prepare(
          `UPDATE job_matches
              SET status = 'ignored',
                  ignored_at = ?,
                  status_note = ?,
                  status_updated_by = 'freshness-service',
                  updated_at = ?
            WHERE id = ?`
        )
        .run(atIso, note, atIso, matchId)

      this.db
        .prepare(
          `INSERT INTO application_status_history
             (id, job_match_id, from_status, to_status, changed_by, application_email_id, note, created_at)
           VALUES (?, ?, 'active', 'ignored', 'email_tracker', NULL, ?, ?)`
        )
        .run(historyId, matchId, note, atIso)

      return true
    })()
    return result
  }
}
