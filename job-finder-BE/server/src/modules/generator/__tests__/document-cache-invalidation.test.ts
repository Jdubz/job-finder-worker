import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock all repositories before importing the module under test
const mockConfigGet = vi.fn()
const mockContentItemList = vi.fn()
const mockGetPrompts = vi.fn()
const mockRemoveStaleEntries = vi.fn()

vi.mock('../../config/config.repository', () => ({
  ConfigRepository: vi.fn(() => ({ get: mockConfigGet })),
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

// Use a stable mock for computeContentHash so we can assert on removeStaleEntries calls
vi.mock('../workflow/services/content-hash.util', () => ({
  computeContentHash: vi.fn(() => 'mock-hash-abc'),
}))

import { invalidateDocumentCacheAsync } from '../document-cache-invalidation'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('invalidateDocumentCacheAsync', () => {
  it('computes hash and calls removeStaleEntries', async () => {
    mockConfigGet.mockReturnValue({
      payload: { name: 'Alice', email: 'alice@test.com' },
    })
    mockContentItemList.mockReturnValue([{ id: 'ci-1', title: 'Test' }])
    mockGetPrompts.mockReturnValue({
      resumeGeneration: 'resume prompt',
      coverLetterGeneration: 'cover letter prompt',
    })
    mockRemoveStaleEntries.mockReturnValue(3)

    await invalidateDocumentCacheAsync()

    expect(mockConfigGet).toHaveBeenCalledWith('personal-info')
    expect(mockContentItemList).toHaveBeenCalled()
    expect(mockGetPrompts).toHaveBeenCalled()
    expect(mockRemoveStaleEntries).toHaveBeenCalledWith('mock-hash-abc')
  })

  it('skips when personalInfo is not configured', async () => {
    mockConfigGet.mockReturnValue(null)

    await invalidateDocumentCacheAsync()

    expect(mockRemoveStaleEntries).not.toHaveBeenCalled()
  })

  it('skips when personalInfo payload is missing', async () => {
    mockConfigGet.mockReturnValue({ payload: null })

    await invalidateDocumentCacheAsync()

    expect(mockRemoveStaleEntries).not.toHaveBeenCalled()
  })

  it('skips when prompts are not configured', async () => {
    mockConfigGet.mockReturnValue({
      payload: { name: 'Alice', email: 'alice@test.com' },
    })
    mockGetPrompts.mockImplementation(() => {
      throw new Error("Prompts configuration 'ai-prompts' not found")
    })

    await invalidateDocumentCacheAsync()

    expect(mockRemoveStaleEntries).not.toHaveBeenCalled()
  })

  it('does not throw when removeStaleEntries fails', async () => {
    mockConfigGet.mockReturnValue({
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
    await expect(invalidateDocumentCacheAsync()).resolves.toBeUndefined()
  })

  it('does not throw when config repo fails', async () => {
    mockConfigGet.mockImplementation(() => {
      throw new Error('DB connection lost')
    })

    await expect(invalidateDocumentCacheAsync()).resolves.toBeUndefined()
  })
})
