import { describe, expect, it } from 'vitest'
import {
  hasQueueItem,
  hasQueueItemId,
  isSnapshotData,
  isHeartbeatData,
  isQueueSseEventName,
  isWorkerEventName,
  type QueueItem,
  type ItemCreatedEventData,
  type ItemUpdatedEventData,
  type ItemDeletedEventData,
  type SnapshotEventData,
  type HeartbeatEventData,
  type ProgressEventData,
  type QueueSsePayload,
  type WorkerMessage,
} from '@shared/types'

// Mock QueueItem for testing
const mockQueueItem: QueueItem = {
  id: 'test-123',
  type: 'job',
  status: 'pending',
  url: 'https://example.com/job/123',
  company_name: 'Test Company',
  company_id: null,
  source: 'user_submission',
  retry_count: 0,
  max_retries: 0,
  created_at: new Date(),
  updated_at: new Date(),
}

describe('Queue Event Type Guards', () => {
  describe('hasQueueItem', () => {
    it('returns true for ItemCreatedEventData', () => {
      const data: ItemCreatedEventData = { queueItem: mockQueueItem }
      expect(hasQueueItem(data)).toBe(true)
    })

    it('returns true for ItemUpdatedEventData', () => {
      const data: ItemUpdatedEventData = { queueItem: mockQueueItem, workerId: 'default' }
      expect(hasQueueItem(data)).toBe(true)
    })

    it('returns false for ItemDeletedEventData', () => {
      const data: ItemDeletedEventData = { queueItemId: 'test-123' }
      expect(hasQueueItem(data)).toBe(false)
    })

    it('returns false for null', () => {
      expect(hasQueueItem(null)).toBe(false)
    })

    it('returns false for undefined', () => {
      expect(hasQueueItem(undefined)).toBe(false)
    })

    it('returns false for empty object', () => {
      expect(hasQueueItem({})).toBe(false)
    })

    it('returns false when queueItem is not an object', () => {
      expect(hasQueueItem({ queueItem: 'string' })).toBe(false)
    })
  })

  describe('hasQueueItemId', () => {
    it('returns true for ItemDeletedEventData', () => {
      const data: ItemDeletedEventData = { queueItemId: 'test-123' }
      expect(hasQueueItemId(data)).toBe(true)
    })

    it('returns false for ItemCreatedEventData', () => {
      const data: ItemCreatedEventData = { queueItem: mockQueueItem }
      expect(hasQueueItemId(data)).toBe(false)
    })

    it('returns false for null', () => {
      expect(hasQueueItemId(null)).toBe(false)
    })

    it('returns false when queueItemId is not a string', () => {
      expect(hasQueueItemId({ queueItemId: 123 })).toBe(false)
    })
  })

  describe('isSnapshotData', () => {
    it('returns true for valid snapshot data', () => {
      const data: SnapshotEventData = { items: [mockQueueItem] }
      expect(isSnapshotData(data)).toBe(true)
    })

    it('returns true for empty items array', () => {
      const data: SnapshotEventData = { items: [] }
      expect(isSnapshotData(data)).toBe(true)
    })

    it('returns false when items is not an array', () => {
      expect(isSnapshotData({ items: 'not-array' })).toBe(false)
    })

    it('returns false for null', () => {
      expect(isSnapshotData(null)).toBe(false)
    })
  })

  describe('isHeartbeatData', () => {
    it('returns true for valid heartbeat data', () => {
      const data: HeartbeatEventData = { iteration: 42 }
      expect(isHeartbeatData(data)).toBe(true)
    })

    it('returns true with workerId', () => {
      const data: HeartbeatEventData = { iteration: 1, workerId: 'worker-1' }
      expect(isHeartbeatData(data)).toBe(true)
    })

    it('returns false when iteration is not a number', () => {
      expect(isHeartbeatData({ iteration: 'not-number' })).toBe(false)
    })

    it('returns false for null', () => {
      expect(isHeartbeatData(null)).toBe(false)
    })
  })
})

describe('Event Name Validators', () => {
  describe('isQueueSseEventName', () => {
    it.each([
      'snapshot',
      'item.created',
      'item.updated',
      'item.deleted',
      'item.cancelled',
      'progress',
      'heartbeat',
      'command.ack',
      'command.error',
    ])('returns true for valid SSE event name: %s', (name) => {
      expect(isQueueSseEventName(name)).toBe(true)
    })

    it('returns false for unknown event name', () => {
      expect(isQueueSseEventName('unknown.event')).toBe(false)
    })

    it('returns false for empty string', () => {
      expect(isQueueSseEventName('')).toBe(false)
    })
  })

  describe('isWorkerEventName', () => {
    it.each([
      'item.created',
      'item.updated',
      'item.deleted',
      'heartbeat',
    ])('returns true for valid worker event name: %s', (name) => {
      expect(isWorkerEventName(name)).toBe(true)
    })

    it('returns false for SSE-only events', () => {
      expect(isWorkerEventName('snapshot')).toBe(false)
      expect(isWorkerEventName('progress')).toBe(false)
      expect(isWorkerEventName('command.ack')).toBe(false)
    })

    it('returns false for unknown event name', () => {
      expect(isWorkerEventName('unknown.event')).toBe(false)
    })
  })
})

describe('Event Payload Structures', () => {
  describe('SSE Payload', () => {
    it('snapshot payload has correct structure', () => {
      const payload: QueueSsePayload<'snapshot'> = {
        id: 'evt-123',
        event: 'snapshot',
        data: { items: [mockQueueItem] },
        ts: new Date().toISOString(),
      }

      expect(payload.event).toBe('snapshot')
      expect(payload.data.items).toHaveLength(1)
      expect(payload.id).toBeDefined()
      expect(payload.ts).toBeDefined()
    })

    it('item.created payload has correct structure', () => {
      const payload: QueueSsePayload<'item.created'> = {
        id: 'evt-456',
        event: 'item.created',
        data: { queueItem: mockQueueItem },
        ts: new Date().toISOString(),
      }

      expect(payload.event).toBe('item.created')
      expect(payload.data.queueItem.id).toBe(mockQueueItem.id)
    })

    it('item.updated payload has correct structure', () => {
      const payload: QueueSsePayload<'item.updated'> = {
        id: 'evt-789',
        event: 'item.updated',
        data: { queueItem: { ...mockQueueItem, status: 'processing' }, workerId: 'worker-1' },
        ts: new Date().toISOString(),
      }

      expect(payload.event).toBe('item.updated')
      expect(payload.data.queueItem.status).toBe('processing')
      expect(payload.data.workerId).toBe('worker-1')
    })

    it('item.deleted payload has correct structure', () => {
      const payload: QueueSsePayload<'item.deleted'> = {
        id: 'evt-101',
        event: 'item.deleted',
        data: { queueItemId: 'test-123' },
        ts: new Date().toISOString(),
      }

      expect(payload.event).toBe('item.deleted')
      expect(payload.data.queueItemId).toBe('test-123')
    })

    it('heartbeat payload has correct structure', () => {
      const payload: QueueSsePayload<'heartbeat'> = {
        id: 'evt-102',
        event: 'heartbeat',
        data: { iteration: 42, workerId: 'default' },
        ts: new Date().toISOString(),
      }

      expect(payload.event).toBe('heartbeat')
      expect(payload.data.iteration).toBe(42)
    })

    it('progress payload has correct structure', () => {
      const payload: QueueSsePayload<'progress'> = {
        id: 'evt-103',
        event: 'progress',
        data: {
          itemId: 'test-123',
          stage: 'scrape',
          status: 'started',
          message: 'Scraping job data',
          workerId: 'default',
        },
        ts: new Date().toISOString(),
      }

      expect(payload.event).toBe('progress')
      expect(payload.data.itemId).toBe('test-123')
      expect(payload.data.stage).toBe('scrape')
      expect(payload.data.status).toBe('started')
    })
  })

  describe('Worker Message', () => {
    it('item.created message has correct structure', () => {
      const msg: WorkerMessage<'item.created'> = {
        event: 'item.created',
        data: { queueItem: mockQueueItem, workerId: 'worker-1' },
      }

      expect(msg.event).toBe('item.created')
      expect(msg.data.queueItem.id).toBe(mockQueueItem.id)
    })

    it('item.updated message has correct structure', () => {
      const msg: WorkerMessage<'item.updated'> = {
        event: 'item.updated',
        data: { queueItem: { ...mockQueueItem, status: 'success' }, workerId: 'worker-1' },
      }

      expect(msg.event).toBe('item.updated')
      expect(msg.data.queueItem.status).toBe('success')
    })

    it('heartbeat message has correct structure', () => {
      const msg: WorkerMessage<'heartbeat'> = {
        event: 'heartbeat',
        data: { iteration: 100, workerId: 'default' },
      }

      expect(msg.event).toBe('heartbeat')
      expect(msg.data.iteration).toBe(100)
    })
  })
})

describe('Type Safety - Compile-time Checks', () => {
  // These tests verify that the type system catches errors at compile time
  // If these compile, the types are correct

  it('QueueSsePayload enforces correct data type for event', () => {
    // This should compile - correct data for snapshot
    const snapshot: QueueSsePayload<'snapshot'> = {
      id: '1',
      event: 'snapshot',
      data: { items: [] },
      ts: '',
    }
    expect(snapshot).toBeDefined()

    // This should compile - correct data for item.created
    const created: QueueSsePayload<'item.created'> = {
      id: '2',
      event: 'item.created',
      data: { queueItem: mockQueueItem },
      ts: '',
    }
    expect(created).toBeDefined()
  })

  it('WorkerMessage enforces correct data type for event', () => {
    // This should compile - correct data for item.updated
    const updated: WorkerMessage<'item.updated'> = {
      event: 'item.updated',
      data: { queueItem: mockQueueItem },
    }
    expect(updated).toBeDefined()
  })
})
