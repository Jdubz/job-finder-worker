import type Database from 'better-sqlite3'
import { getDb } from '../../db/sqlite'

export interface MaintenanceStats {
  archivedQueueItems: number
  archivedListings: number
  ignoredMatches: number
}

export class MaintenanceRepository {
  private db: Database.Database

  constructor() {
    this.db = getDb()
  }

  /**
   * Archive job_queue items older than specified days with terminal status.
   * Terminal statuses: success, failed, skipped
   */
  archiveOldQueueItems(olderThanDays: number): number {
    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString()
    const now = new Date().toISOString()

    const terminalStatuses = ['success', 'failed', 'skipped']
    const placeholders = terminalStatuses.map(() => '?').join(',')

    const result = this.db.transaction(() => {
      // Copy to archive with archived_at timestamp
      const insertStmt = this.db.prepare(`
        INSERT INTO job_queue_archive (
          id, type, status, url, tracking_id, parent_item_id,
          input, output, result_message, error_details,
          created_at, updated_at, processed_at, completed_at,
          archived_at
        )
        SELECT
          id, type, status, url, tracking_id, parent_item_id,
          input, output, result_message, error_details,
          created_at, updated_at, processed_at, completed_at,
          ?
        FROM job_queue
        WHERE completed_at < ?
        AND status IN (${placeholders})
      `)
      const insertResult = insertStmt.run(now, cutoff, ...terminalStatuses)

      // Delete from main table
      const deleteStmt = this.db.prepare(`
        DELETE FROM job_queue
        WHERE completed_at < ?
        AND status IN (${placeholders})
      `)
      deleteStmt.run(cutoff, ...terminalStatuses)

      return insertResult.changes
    })()

    return result
  }

  /**
   * Mark job_matches older than specified days as ignored.
   * Only affects matches with status='active'.
   */
  ignoreOldMatches(olderThanDays: number): number {
    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString()
    const now = new Date().toISOString()

    const result = this.db.prepare(`
      UPDATE job_matches
      SET status = 'ignored', ignored_at = ?
      WHERE created_at < ?
      AND status = 'active'
    `).run(now, cutoff)

    return result.changes
  }

  /**
   * Archive job_listings older than specified days.
   * Note: Associated job_matches will be deleted via CASCADE.
   */
  archiveOldListings(olderThanDays: number): number {
    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString()
    const now = new Date().toISOString()

    const result = this.db.transaction(() => {
      // Copy to archive with archived_at timestamp
      const insertStmt = this.db.prepare(`
        INSERT INTO job_listings_archive (
          id, url, source_id, company_id,
          title, company_name, location, salary_range, description, posted_date,
          status, filter_result, match_score,
          created_at, updated_at,
          archived_at
        )
        SELECT
          id, url, source_id, company_id,
          title, company_name, location, salary_range, description, posted_date,
          status, filter_result, match_score,
          created_at, updated_at,
          ?
        FROM job_listings
        WHERE created_at < ?
      `)
      const insertResult = insertStmt.run(now, cutoff)

      // Delete from main table (CASCADE will remove job_matches)
      const deleteStmt = this.db.prepare(`
        DELETE FROM job_listings
        WHERE created_at < ?
      `)
      deleteStmt.run(cutoff)

      return insertResult.changes
    })()

    return result
  }

  /**
   * Check if URL exists in job_listings_archive.
   * Used for deduplication during scraping.
   */
  urlExistsInArchive(url: string): boolean {
    const row = this.db.prepare(`
      SELECT 1 FROM job_listings_archive WHERE url = ? LIMIT 1
    `).get(url)
    return !!row
  }

  /**
   * Get maintenance statistics.
   */
  getStats(): MaintenanceStats {
    const queueArchiveCount = this.db.prepare(
      'SELECT COUNT(*) as count FROM job_queue_archive'
    ).get() as { count: number }

    const listingsArchiveCount = this.db.prepare(
      'SELECT COUNT(*) as count FROM job_listings_archive'
    ).get() as { count: number }

    const ignoredMatchesCount = this.db.prepare(
      `SELECT COUNT(*) as count FROM job_matches WHERE status = 'ignored'`
    ).get() as { count: number }

    return {
      archivedQueueItems: queueArchiveCount.count,
      archivedListings: listingsArchiveCount.count,
      ignoredMatches: ignoredMatchesCount.count
    }
  }
}
