import { logger } from '../../logger'
import { MaintenanceRepository, type MaintenanceStats } from './maintenance.repository'
import { DocumentCacheRepository } from '../generator/document-cache.repository'

export interface MaintenanceResult {
  success: boolean
  archivedQueueItems: number
  archivedListings: number
  prunedCacheEntries: number
  error?: string
}

// Configuration constants
const QUEUE_ARCHIVE_DAYS = 7 // Archive queue items older than 1 week
const LISTING_ARCHIVE_DAYS = 14 // Archive listings older than 2 weeks
const CACHE_PRUNE_DAYS = 30 // Prune document cache entries older than 30 days

export class MaintenanceService {
  constructor(
    private repo = new MaintenanceRepository(),
    private cacheRepo = new DocumentCacheRepository()
  ) {}

  runMaintenance(): MaintenanceResult {
    logger.info('Starting maintenance cycle')

    try {
      // 1. Archive old listings (older than 2 weeks)
      // Note: This CASCADE deletes associated job_matches
      const archivedListings = this.repo.archiveOldListings(LISTING_ARCHIVE_DAYS)
      logger.info({ count: archivedListings, days: LISTING_ARCHIVE_DAYS }, 'Archived old listings')

      // 2. Archive old queue items (older than 1 week)
      const archivedQueueItems = this.repo.archiveOldQueueItems(QUEUE_ARCHIVE_DAYS)
      logger.info({ count: archivedQueueItems, days: QUEUE_ARCHIVE_DAYS }, 'Archived old queue items')

      // 3. Prune old document cache entries (older than 30 days)
      const prunedCacheEntries = this.cacheRepo.pruneOlderThan(CACHE_PRUNE_DAYS)
      logger.info({ count: prunedCacheEntries, days: CACHE_PRUNE_DAYS }, 'Pruned old document cache entries')

      logger.info(
        {
          archivedQueueItems,
          archivedListings,
          prunedCacheEntries
        },
        'Maintenance cycle completed'
      )

      return {
        success: true,
        archivedQueueItems,
        archivedListings,
        prunedCacheEntries
      }
    } catch (error) {
      logger.error({ error }, 'Maintenance cycle failed')
      return {
        success: false,
        archivedQueueItems: 0,
        archivedListings: 0,
        prunedCacheEntries: 0,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  getStats(): MaintenanceStats {
    return this.repo.getStats()
  }
}
