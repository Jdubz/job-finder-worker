import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MaintenanceService } from '../maintenance.service'
import type { MaintenanceRepository } from '../maintenance.repository'
import type { DocumentCacheRepository } from '../../generator/document-cache.repository'

vi.mock('../../../logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}))

describe('MaintenanceService', () => {
  let service: MaintenanceService
  let mockRepo: {
    archiveOldListings: ReturnType<typeof vi.fn>
    archiveOldQueueItems: ReturnType<typeof vi.fn>
    getStats: ReturnType<typeof vi.fn>
  }
  let mockCacheRepo: {
    pruneOlderThan: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    mockRepo = {
      archiveOldListings: vi.fn().mockReturnValue(5),
      archiveOldQueueItems: vi.fn().mockReturnValue(10),
      getStats: vi.fn().mockReturnValue({ archivedQueueItems: 100, archivedListings: 50 })
    }
    mockCacheRepo = {
      pruneOlderThan: vi.fn().mockReturnValue(3)
    }

    service = new MaintenanceService(
      mockRepo as unknown as MaintenanceRepository,
      mockCacheRepo as unknown as DocumentCacheRepository
    )
  })

  describe('runMaintenance', () => {
    it('archives listings, queue items, and prunes cache', () => {
      const result = service.runMaintenance()

      expect(result).toEqual({
        success: true,
        archivedQueueItems: 10,
        archivedListings: 5,
        prunedCacheEntries: 3
      })

      // Verify called with correct day thresholds
      expect(mockRepo.archiveOldListings).toHaveBeenCalledWith(14)
      expect(mockRepo.archiveOldQueueItems).toHaveBeenCalledWith(7)
      expect(mockCacheRepo.pruneOlderThan).toHaveBeenCalledWith(30)
    })

    it('returns failure result when an error occurs', () => {
      mockRepo.archiveOldListings.mockImplementation(() => {
        throw new Error('DB locked')
      })

      const result = service.runMaintenance()

      expect(result).toEqual({
        success: false,
        archivedQueueItems: 0,
        archivedListings: 0,
        prunedCacheEntries: 0,
        error: 'DB locked'
      })
    })

    it('handles non-Error thrown values', () => {
      mockRepo.archiveOldListings.mockImplementation(() => {
        throw 'string error'
      })

      const result = service.runMaintenance()

      expect(result.success).toBe(false)
      expect(result.error).toBe('string error')
    })
  })

  describe('getStats', () => {
    it('delegates to repository', () => {
      const stats = service.getStats()

      expect(stats).toEqual({ archivedQueueItems: 100, archivedListings: 50 })
      expect(mockRepo.getStats).toHaveBeenCalled()
    })
  })
})
