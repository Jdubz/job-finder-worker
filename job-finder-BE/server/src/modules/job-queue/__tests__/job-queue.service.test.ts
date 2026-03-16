import { beforeEach, describe, expect, it } from 'vitest'
import { JobQueueService, type SubmitJobInput, type SubmitCompanyInput } from '../job-queue.service'
import { getDb } from '../../../db/sqlite'

describe('JobQueueService', () => {
  const service = new JobQueueService()
  const db = getDb()

  beforeEach(() => {
    db.prepare('DELETE FROM job_queue').run()
  })

  describe('submitJob', () => {
    it('creates a pending job queue item', () => {
      const input: SubmitJobInput = {
        url: 'https://example.com/job/123',
        companyName: 'Acme Corp',
        source: 'user_submission'
      }

      const item = service.submitJob(input)

      expect(item.id).toBeDefined()
      expect(item.type).toBe('job')
      expect(item.status).toBe('pending')
      expect(item.url).toBe('https://example.com/job/123')
      expect(item.company_name).toBe('Acme Corp')
      expect(item.source).toBe('user_submission')
    })

    it('sets status to success when generationId is provided', () => {
      const input: SubmitJobInput = {
        url: 'https://example.com/job/456',
        generationId: 'gen-123'
      }

      const item = service.submitJob(input)

      expect(item.status).toBe('success')
      expect(item.result_message).toBe('Generated via document builder')
      expect(item.completed_at).toBeDefined()
    })

    it('packs metadata including manual fields', () => {
      const input: SubmitJobInput = {
        url: 'https://example.com/job/789',
        title: 'Senior Engineer',
        description: 'Build things',
        location: 'Remote',
        techStack: 'TypeScript',
        companyUrl: 'https://acme.com',
        bypassFilter: true
      }

      const item = service.submitJob(input)

      expect(item.metadata).toMatchObject({
        manualTitle: 'Senior Engineer',
        manualDescription: 'Build things',
        manualLocation: 'Remote',
        manualTechStack: 'TypeScript',
        companyUrl: 'https://acme.com',
        bypassFilter: true
      })
    })

    it('marks url-only submissions', () => {
      const input: SubmitJobInput = {
        url: 'https://example.com/job/999'
      }

      const item = service.submitJob(input)

      expect(item.metadata).toMatchObject({ urlOnlySubmission: true })
    })
  })

  describe('submitCompany', () => {
    it('creates a pending company queue item', () => {
      const input: SubmitCompanyInput = {
        companyName: 'Acme Corp',
        websiteUrl: 'https://acme.com',
        source: 'manual_submission'
      }

      const item = service.submitCompany(input)

      expect(item.type).toBe('company')
      expect(item.status).toBe('pending')
      expect(item.company_name).toBe('Acme Corp')
    })

    it('throws when duplicate active company task exists', () => {
      const input: SubmitCompanyInput = {
        companyName: 'Acme Corp',
        companyId: 'company-1'
      }

      service.submitCompany(input)

      expect(() => service.submitCompany(input)).toThrow(
        'A re-analysis task for this company is already in the queue'
      )
    })

    it('allows resubmission when previous task completed', () => {
      const input: SubmitCompanyInput = {
        companyName: 'Acme Corp',
        companyId: 'company-2'
      }

      const first = service.submitCompany(input)
      service.update(first.id!, { status: 'processing' })
      service.update(first.id!, { status: 'success' })

      // Should not throw — previous task is terminal
      const second = service.submitCompany(input)
      expect(second.id).toBeDefined()
      expect(second.id).not.toBe(first.id)
    })
  })

  describe('submitScrape', () => {
    it('creates a scrape queue item with config', () => {
      const item = service.submitScrape({
        scrapeConfig: { target_matches: 10, max_sources: 5 }
      })

      expect(item.type).toBe('scrape')
      expect(item.status).toBe('pending')
      expect(item.source).toBe('automated_scan')
      expect(item.scrape_config).toEqual({
        target_matches: 10,
        max_sources: 5,
        source_ids: undefined
      })
    })

    it('normalizes zero values to null', () => {
      const item = service.submitScrape({
        scrapeConfig: { target_matches: 0, max_sources: 0 }
      })

      expect(item.scrape_config).toEqual({
        target_matches: null,
        max_sources: null,
        source_ids: undefined
      })
    })
  })

  describe('submitSourceDiscovery', () => {
    it('creates a source_discovery item', () => {
      const item = service.submitSourceDiscovery({
        url: 'https://boards.greenhouse.io/acme',
        companyName: 'Acme',
        typeHint: 'greenhouse'
      })

      expect(item.type).toBe('source_discovery')
      expect(item.status).toBe('pending')
      expect(item.source_discovery_config).toMatchObject({
        url: 'https://boards.greenhouse.io/acme',
        type_hint: 'greenhouse',
        company_name: 'Acme'
      })
    })

    it('defaults typeHint to auto', () => {
      const item = service.submitSourceDiscovery({
        url: 'https://example.com/careers'
      })

      expect(item.source_discovery_config?.type_hint).toBe('auto')
    })
  })

  describe('submitSourceRecover', () => {
    it('creates a source_recover item', () => {
      const item = service.submitSourceRecover({ sourceId: 'source-abc' })

      expect(item.type).toBe('source_recover')
      expect(item.status).toBe('pending')
      expect(item.source_id).toBe('source-abc')
    })
  })

  describe('update', () => {
    it('updates item status', () => {
      const item = service.submitJob({ url: 'https://example.com/j/1' })
      const updated = service.update(item.id!, { status: 'processing' })

      expect(updated.status).toBe('processing')
    })

    it('throws when item not found', () => {
      expect(() => service.update('nonexistent', { status: 'processing' })).toThrow(
        'Queue item not found: nonexistent'
      )
    })

    it('blocks moving to pending via update (must use retry)', () => {
      const item = service.submitJob({ url: 'https://example.com/j/2' })
      service.update(item.id!, { status: 'processing' })

      expect(() => service.update(item.id!, { status: 'pending' })).toThrow(
        'Use retry() to move failed items back to pending'
      )
    })
  })

  describe('retry', () => {
    it('resets a failed item to pending', () => {
      const item = service.submitJob({ url: 'https://example.com/j/3' })
      service.update(item.id!, { status: 'processing' })
      service.update(item.id!, { status: 'failed', error_details: 'timeout' })

      const retried = service.retry(item.id!)

      expect(retried.status).toBe('pending')
      expect(retried.error_details).toBeUndefined()
      expect(retried.result_message).toBeUndefined()
    })

    it('throws when item is not failed', () => {
      const item = service.submitJob({ url: 'https://example.com/j/4' })

      expect(() => service.retry(item.id!)).toThrow('Only failed items can be retried')
    })

    it('throws when item not found', () => {
      expect(() => service.retry('nonexistent')).toThrow('Queue item not found: nonexistent')
    })
  })

  describe('unblockItem', () => {
    it('resets a blocked item to pending', () => {
      const item = service.submitJob({ url: 'https://example.com/j/5' })
      service.update(item.id!, { status: 'blocked' })

      const unblocked = service.unblockItem(item.id!)

      expect(unblocked.status).toBe('pending')
    })

    it('throws when item is not blocked', () => {
      const item = service.submitJob({ url: 'https://example.com/j/6' })

      expect(() => service.unblockItem(item.id!)).toThrow('Only blocked items can be unblocked')
    })
  })

  describe('unblockAll', () => {
    it('unblocks all blocked items', () => {
      const a = service.submitJob({ url: 'https://example.com/j/7' })
      const b = service.submitJob({ url: 'https://example.com/j/8' })
      service.update(a.id!, { status: 'blocked' })
      service.update(b.id!, { status: 'blocked' })

      const count = service.unblockAll()

      expect(count).toBe(2)
      expect(service.getItem(a.id!)?.status).toBe('pending')
      expect(service.getItem(b.id!)?.status).toBe('pending')
    })
  })

  describe('getStats', () => {
    it('returns counts by status', () => {
      service.submitJob({ url: 'https://example.com/j/a' })
      service.submitJob({ url: 'https://example.com/j/b' })
      const c = service.submitJob({ url: 'https://example.com/j/c' })
      service.update(c.id!, { status: 'processing' })

      const stats = service.getStats()

      expect(stats.pending).toBe(2)
      expect(stats.processing).toBe(1)
      expect(stats.total).toBe(3)
    })
  })

  describe('list / listWithTotal', () => {
    it('lists items with pagination', () => {
      service.submitJob({ url: 'https://example.com/j/1' })
      service.submitJob({ url: 'https://example.com/j/2' })
      service.submitJob({ url: 'https://example.com/j/3' })

      const result = service.listWithTotal({ limit: 2 })

      expect(result.items).toHaveLength(2)
      expect(result.total).toBe(3)
    })
  })

  describe('delete', () => {
    it('removes a queue item', () => {
      const item = service.submitJob({ url: 'https://example.com/j/del' })

      service.delete(item.id!)

      expect(service.getItem(item.id!)).toBeNull()
    })
  })
})
