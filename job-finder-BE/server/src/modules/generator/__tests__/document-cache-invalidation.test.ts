import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock all repositories before importing the module under test
const mockUserConfigGet = vi.fn()
const mockContentItemList = vi.fn()
const mockGetPrompts = vi.fn()
const mockRemoveStaleEntries = vi.fn()
const mockDbPrepare = vi.fn()

vi.mock('../../user-config/user-config.repository', () => ({
  UserConfigRepository: vi.fn(() => ({ get: mockUserConfigGet })),
}))

vi.mock('../../content-items/content-item.repository', () => ({
  ContentItemRepository: vi.fn(() => ({ list: mockContentItemList })),
}))

vi.mock('../../prompts/prompts.repository', () => ({
  PromptsRepository: vi.fn(() => ({ getPrompts: mockGetPrompts })),
}))

vi.mock('../document-cache.repository', () => ({
  DocumentCacheRepository: vi.fn(() => ({ removeStaleEntries: mockRemoveStaleEntries })),
}))

vi.mock('../../../db/sqlite', () => ({
  isVecAvailable: vi.fn(() => true),
  getDb: vi.fn(() => ({ prepare: mockDbPrepare })),
  checkpointWal: vi.fn(),
}))

// Use a stable mock for computeContentHash so we can assert on removeStaleEntries calls
vi.mock('../workflow/services/content-hash.util', () => ({
  computeContentHash: vi.fn(() => 'mock-hash-abc'),
}))

import { invalidateDocumentCacheAsync } from '../document-cache-invalidation'

const TEST_USER_ID = 'user-123'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('invalidateDocumentCacheAsync', () => {
  describe('with userId (single-user invalidation)', () => {
    it('computes hash and calls removeStaleEntries', async () => {
      mockUserConfigGet.mockReturnValue({
        payload: { name: 'Alice', email: 'alice@test.com' },
      })
      mockContentItemList.mockReturnValue([{ id: 'ci-1', title: 'Test' }])
      mockGetPrompts.mockReturnValue({
        resumeGeneration: 'resume prompt',
        coverLetterGeneration: 'cover letter prompt',
      })
      mockRemoveStaleEntries.mockReturnValue(3)

      await invalidateDocumentCacheAsync(TEST_USER_ID)

      expect(mockUserConfigGet).toHaveBeenCalledWith(TEST_USER_ID, 'personal-info')
      expect(mockContentItemList).toHaveBeenCalledWith(TEST_USER_ID)
      expect(mockGetPrompts).toHaveBeenCalled()
      expect(mockRemoveStaleEntries).toHaveBeenCalledWith(TEST_USER_ID, 'mock-hash-abc')
    })

    it('skips when personalInfo is not configured', async () => {
      mockUserConfigGet.mockReturnValue(null)

      await invalidateDocumentCacheAsync(TEST_USER_ID)

      expect(mockRemoveStaleEntries).not.toHaveBeenCalled()
    })

    it('skips when personalInfo payload is missing', async () => {
      mockUserConfigGet.mockReturnValue({ payload: null })

      await invalidateDocumentCacheAsync(TEST_USER_ID)

      expect(mockRemoveStaleEntries).not.toHaveBeenCalled()
    })

    it('skips when prompts are not configured', async () => {
      mockUserConfigGet.mockReturnValue({
        payload: { name: 'Alice', email: 'alice@test.com' },
      })
      mockGetPrompts.mockImplementation(() => {
        throw new Error("Prompts configuration 'ai-prompts' not found")
      })

      await invalidateDocumentCacheAsync(TEST_USER_ID)

      expect(mockRemoveStaleEntries).not.toHaveBeenCalled()
    })

    it('does not throw when removeStaleEntries fails', async () => {
      mockUserConfigGet.mockReturnValue({
        payload: { name: 'Alice', email: 'alice@test.com' },
      })
      mockContentItemList.mockReturnValue([])
      mockGetPrompts.mockReturnValue({
        resumeGeneration: 'r',
        coverLetterGeneration: 'c',
      })
      mockRemoveStaleEntries.mockImplementation(() => {
        throw new Error('DB error')
      })

      // Should not throw
      await expect(invalidateDocumentCacheAsync(TEST_USER_ID)).resolves.toBeUndefined()
    })

    it('does not throw when config repo fails', async () => {
      mockUserConfigGet.mockImplementation(() => {
        throw new Error('DB connection lost')
      })

      await expect(invalidateDocumentCacheAsync(TEST_USER_ID)).resolves.toBeUndefined()
    })
  })

  describe('without userId (all-users invalidation)', () => {
    it('queries distinct user_ids and invalidates each', async () => {
      mockDbPrepare.mockReturnValue({
        all: vi.fn().mockReturnValue([
          { user_id: 'user-a' },
          { user_id: 'user-b' },
        ]),
      })
      mockUserConfigGet.mockReturnValue({
        payload: { name: 'Alice', email: 'alice@test.com' },
      })
      mockContentItemList.mockReturnValue([])
      mockGetPrompts.mockReturnValue({
        resumeGeneration: 'r',
        coverLetterGeneration: 'c',
      })
      mockRemoveStaleEntries.mockReturnValue(0)

      await invalidateDocumentCacheAsync()

      expect(mockDbPrepare).toHaveBeenCalledWith('SELECT DISTINCT user_id FROM document_cache')
      expect(mockUserConfigGet).toHaveBeenCalledWith('user-a', 'personal-info')
      expect(mockUserConfigGet).toHaveBeenCalledWith('user-b', 'personal-info')
    })

    it('does not throw when no users have cache entries', async () => {
      mockDbPrepare.mockReturnValue({
        all: vi.fn().mockReturnValue([]),
      })

      await expect(invalidateDocumentCacheAsync()).resolves.toBeUndefined()
    })
  })
})
