import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ContentItemsClient, ROOT_PARENT_SENTINEL } from '../content-items-client'

vi.mock('@/config/api', () => ({
  API_CONFIG: { baseUrl: 'https://api.test.com' }
}))

vi.mock('@/lib/api-error-handler', () => ({
  handleApiError: vi.fn((e: unknown) => e)
}))

const mockFetch = vi.fn()
global.fetch = mockFetch

describe('ContentItemsClient', () => {
  let client: ContentItemsClient

  beforeEach(() => {
    vi.clearAllMocks()
    client = new ContentItemsClient('https://api.test.com')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const mockSuccess = (data: unknown) => ({
    ok: true,
    headers: { get: () => 'application/json' },
    json: () => Promise.resolve({ data })
  })

  describe('list', () => {
    it('fetches content items with default limit of 100', async () => {
      mockFetch.mockResolvedValue(mockSuccess({ items: [] }))

      await client.list()

      const url = mockFetch.mock.calls[0][0] as string
      expect(url).toContain('limit=100')
    })

    it('uses ROOT_PARENT_SENTINEL for null parentId', async () => {
      mockFetch.mockResolvedValue(mockSuccess({ items: [] }))

      await client.list({ parentId: null })

      const url = mockFetch.mock.calls[0][0] as string
      expect(url).toContain(`parentId=${ROOT_PARENT_SENTINEL}`)
    })

    it('passes parentId for non-null values', async () => {
      mockFetch.mockResolvedValue(mockSuccess({ items: [] }))

      await client.list({ parentId: 'parent-123' })

      const url = mockFetch.mock.calls[0][0] as string
      expect(url).toContain('parentId=parent-123')
    })
  })

  describe('getContentItem', () => {
    it('fetches a single content item', async () => {
      const item = { id: '1', title: 'Experience' }
      mockFetch.mockResolvedValue(mockSuccess({ item }))

      const result = await client.getContentItem('1')

      expect(result).toEqual(item)
    })
  })

  describe('createContentItem', () => {
    it('sends itemData and userEmail', async () => {
      const item = { id: 'new', title: 'Skills' }
      mockFetch.mockResolvedValue(mockSuccess({ item }))

      const result = await client.createContentItem('user@test.com', {
        title: 'Skills',
        type: 'section'
      } as any)

      expect(result).toEqual(item)
      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.userEmail).toBe('user@test.com')
      expect(body.itemData.title).toBe('Skills')
    })
  })

  describe('updateContentItem', () => {
    it('patches content item with userEmail', async () => {
      const item = { id: '1', title: 'Updated' }
      mockFetch.mockResolvedValue(mockSuccess({ item }))

      const result = await client.updateContentItem('1', 'user@test.com', {
        title: 'Updated'
      } as any)

      expect(result).toEqual(item)
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.test.com/content-items/1',
        expect.objectContaining({ method: 'PATCH' })
      )
    })
  })

  describe('deleteContentItem', () => {
    it('deletes content item', async () => {
      mockFetch.mockResolvedValue(mockSuccess({ deleted: true }))

      await client.deleteContentItem('1')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.test.com/content-items/1',
        expect.objectContaining({ method: 'DELETE' })
      )
    })
  })

  describe('reorderContentItem', () => {
    it('posts reorder with parentId and orderIndex', async () => {
      const item = { id: '1', orderIndex: 2 }
      mockFetch.mockResolvedValue(mockSuccess({ item }))

      const result = await client.reorderContentItem('1', 'user@test.com', 'parent-1', 2)

      expect(result).toEqual(item)
      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.parentId).toBe('parent-1')
      expect(body.orderIndex).toBe(2)
      expect(body.userEmail).toBe('user@test.com')
    })
  })
})
