import { logger } from '../../logger'
import { MaintenanceRepository, type MaintenanceStats } from './maintenance.repository'

export interface MaintenanceResult {
  success: boolean
  archivedQueueItems: number
  ignoredMatches: number
  archivedListings: number
  error?: string
}

// Configuration constants
const QUEUE_ARCHIVE_DAYS = 7 // Archive queue items older than 1 week
const MATCH_IGNORE_DAYS = 14 // Ignore matches older than 2 weeks
const LISTING_ARCHIVE_DAYS = 14 // Archive listings older than 2 weeks

export class MaintenanceService {
  constructor(private repo = new MaintenanceRepository()) {}

  async runMaintenance(): Promise<MaintenanceResult> {
    logger.info('Starting maintenance cycle')

    try {
      // 1. Archive old queue items (older than 1 week)
      const archivedQueueItems = this.repo.archiveOldQueueItems(QUEUE_ARCHIVE_DAYS)
      logger.info({ count: archivedQueueItems, days: QUEUE_ARCHIVE_DAYS }, 'Archived old queue items')

      // 2. Mark old matches as ignored (older than 2 weeks)
      const ignoredMatches = this.repo.ignoreOldMatches(MATCH_IGNORE_DAYS)
      logger.info({ count: ignoredMatches, days: MATCH_IGNORE_DAYS }, 'Ignored old matches')

      // 3. Archive old listings (older than 2 weeks)
      // Note: This also cascades to delete associated job_matches
      const archivedListings = this.repo.archiveOldListings(LISTING_ARCHIVE_DAYS)
      logger.info({ count: archivedListings, days: LISTING_ARCHIVE_DAYS }, 'Archived old listings')

      logger.info(
        {
          archivedQueueItems,
          ignoredMatches,
          archivedListings
        },
        'Maintenance cycle completed'
      )

      return {
        success: true,
        archivedQueueItems,
        ignoredMatches,
        archivedListings
      }
    } catch (error) {
      logger.error({ error }, 'Maintenance cycle failed')
      return {
        success: false,
        archivedQueueItems: 0,
        ignoredMatches: 0,
        archivedListings: 0,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  getStats(): MaintenanceStats {
    return this.repo.getStats()
  }
}
