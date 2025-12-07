import { beforeEach, describe, expect, it } from 'vitest'
import { JobQueueRepository, type NewQueueItem } from '../job-queue.repository'
import { getDb } from '../../../db/sqlite'

describe('JobQueueRepository', () => {
  const repo = new JobQueueRepository()
  const db = getDb()

  beforeEach(() => {
    db.prepare('DELETE FROM job_queue').run()
  })

  const buildQueueItem = (overrides: Partial<NewQueueItem> = {}): NewQueueItem => ({
    type: 'job',
    status: 'pending',
    url: 'https://example.com/job/123',
    ...overrides
  })

  describe('enqueue', () => {
    it('creates a queue item with convenience fields packed into input/output', () => {
      const item = repo.enqueue(
        buildQueueItem({
          metadata: { job_title: 'Software Engineer' },
          company_name: 'Test Corp',
          company_id: 'company-123',
          source: 'manual_submission',
          submitted_by: 'user-1',
          scrape_config: { target_matches: 5 },
          source_id: 'source-1',
          source_type: 'greenhouse',
          source_config: { baseUrl: 'https://greenhouse.io' },
          source_tier: 'S'
        })
      )

      expect(item.id).toBeDefined()
      // Convenience fields should be accessible on the item
      expect(item.metadata).toEqual({ job_title: 'Software Engineer' })
      expect(item.company_name).toBe('Test Corp')
      expect(item.company_id).toBe('company-123')
      expect(item.source).toBe('manual_submission')
      expect(item.submitted_by).toBe('user-1')
      expect(item.scrape_config).toEqual({ target_matches: 5 })
      expect(item.source_id).toBe('source-1')
      expect(item.source_type).toBe('greenhouse')
      expect(item.source_config).toEqual({ baseUrl: 'https://greenhouse.io' })
      expect(item.source_tier).toBe('S')

      // Verify the data is stored in input column (not lost)
      expect(item.input).toMatchObject({
        metadata: { job_title: 'Software Engineer' },
        company_name: 'Test Corp'
      })
    })

    it('preserves explicit input data when also setting convenience fields', () => {
      const item = repo.enqueue(
        buildQueueItem({
          input: { custom_field: 'custom_value', existing_key: 'original' },
          metadata: { job_title: 'Engineer' },
          company_name: 'Acme'
        })
      )

      expect(item.input).toMatchObject({
        custom_field: 'custom_value',
        existing_key: 'original',
        metadata: { job_title: 'Engineer' },
        company_name: 'Acme'
      })
    })

    it('packs output convenience fields into output column', () => {
      const item = repo.enqueue(
        buildQueueItem({
          scraped_data: { title: 'Job Title', description: 'Description' },
          pipeline_state: { step: 'scraping', progress: 50 }
        })
      )

      expect(item.scraped_data).toEqual({ title: 'Job Title', description: 'Description' })
      expect(item.pipeline_state).toEqual({ step: 'scraping', progress: 50 })
      expect(item.output).toMatchObject({
        scraped_data: { title: 'Job Title', description: 'Description' },
        pipeline_state: { step: 'scraping', progress: 50 }
      })
    })
  })

  describe('update', () => {
    it('preserves existing input data when merging new convenience fields', () => {
      const created = repo.enqueue(
        buildQueueItem({
          input: { original_key: 'original_value' },
          metadata: { job_title: 'Original Title' },
          company_name: 'Original Corp'
        })
      )

      const updated = repo.update(created.id!, {
        metadata: { job_title: 'Updated Title' }
      })

      // Original data should be preserved
      expect(updated.input?.original_key).toBe('original_value')
      expect(updated.company_name).toBe('Original Corp')
      // Updated field should reflect the change
      expect(updated.metadata).toEqual({ job_title: 'Updated Title' })
    })

    it('preserves existing output data when merging new convenience fields', () => {
      const created = repo.enqueue(
        buildQueueItem({
          output: { original_output: 'value' },
          scraped_data: { title: 'Original' }
        })
      )

      const updated = repo.update(created.id!, {
        pipeline_state: { step: 'completed' }
      })

      // Original output data should be preserved
      expect(updated.output?.original_output).toBe('value')
      expect(updated.scraped_data).toEqual({ title: 'Original' })
      // New field should be added
      expect(updated.pipeline_state).toEqual({ step: 'completed' })
    })

    it('updates override existing convenience field values', () => {
      const created = repo.enqueue(
        buildQueueItem({
          company_name: 'Original Name',
          company_id: 'original-id',
          metadata: { job_title: 'Original Title', extra: 'preserved' }
        })
      )

      const updated = repo.update(created.id!, {
        company_name: 'Updated Name',
        metadata: { job_title: 'Updated Title', new_field: 'new_value' }
      })

      expect(updated.company_name).toBe('Updated Name')
      expect(updated.company_id).toBe('original-id') // unchanged
      expect(updated.metadata).toEqual({ job_title: 'Updated Title', new_field: 'new_value' })
    })

    it('handles null values correctly (does not override with undefined)', () => {
      const created = repo.enqueue(
        buildQueueItem({
          company_name: 'Test Corp',
          company_id: 'id-123'
        })
      )

      // Update with only status change - convenience fields should be preserved
      const updated = repo.update(created.id!, {
        status: 'processing'
      })

      expect(updated.status).toBe('processing')
      expect(updated.company_name).toBe('Test Corp')
      expect(updated.company_id).toBe('id-123')
    })

    it('clears convenience fields when set to explicit null', () => {
      const created = repo.enqueue(
        buildQueueItem({
          company_name: 'Test Corp',
          metadata: { job_title: 'Engineer' }
        })
      )

      const updated = repo.update(created.id!, {
        company_name: null as unknown as string, // Explicit null
        metadata: null as unknown as Record<string, unknown> // Explicit null
      })

      // Null values are stored in input but converted to undefined on retrieval
      // (buildQueueItem uses ?? undefined pattern)
      expect(updated.company_name).toBeUndefined()
      expect(updated.metadata).toBeUndefined()
      // Verify they were actually stored as null in the input column
      expect(updated.input?.company_name).toBeNull()
      expect(updated.input?.metadata).toBeNull()
    })

    it('merges updates.input with existing input and convenience fields', () => {
      const created = repo.enqueue(
        buildQueueItem({
          input: { existing: 'data' },
          company_name: 'Corp'
        })
      )

      const updated = repo.update(created.id!, {
        input: { new_input_field: 'new_value' },
        source_id: 'new-source'
      })

      expect(updated.input).toMatchObject({
        existing: 'data',
        company_name: 'Corp',
        new_input_field: 'new_value',
        source_id: 'new-source'
      })
    })

    it('throws error when updating non-existent item', () => {
      expect(() => repo.update('non-existent-id', { status: 'processing' })).toThrow(
        'Queue item not found: non-existent-id'
      )
    })
  })

  describe('getById', () => {
    it('returns null for non-existent items', () => {
      const result = repo.getById('non-existent')
      expect(result).toBeNull()
    })

    it('returns item with convenience fields extracted from input/output', () => {
      const created = repo.enqueue(
        buildQueueItem({
          metadata: { job_title: 'Test' },
          scraped_data: { content: 'scraped' }
        })
      )

      const fetched = repo.getById(created.id!)

      expect(fetched?.metadata).toEqual({ job_title: 'Test' })
      expect(fetched?.scraped_data).toEqual({ content: 'scraped' })
    })
  })

  describe('hasActiveCompanyTask', () => {
    it('returns true when a pending company task exists', () => {
      repo.enqueue(
        buildQueueItem({
          type: 'company',
          status: 'pending',
          company_id: 'company-123'
        })
      )

      expect(repo.hasActiveCompanyTask('company-123')).toBe(true)
    })

    it('returns true when a processing company task exists', () => {
      repo.enqueue(
        buildQueueItem({
          type: 'company',
          status: 'processing',
          company_id: 'company-456'
        })
      )

      expect(repo.hasActiveCompanyTask('company-456')).toBe(true)
    })

    it('returns false when only successful tasks exist for the company', () => {
      repo.enqueue(
        buildQueueItem({
          type: 'company',
          status: 'success',
          company_id: 'company-789'
        })
      )

      expect(repo.hasActiveCompanyTask('company-789')).toBe(false)
    })

    it('returns false when only failed tasks exist for the company', () => {
      repo.enqueue(
        buildQueueItem({
          type: 'company',
          status: 'failed',
          company_id: 'company-failed'
        })
      )

      expect(repo.hasActiveCompanyTask('company-failed')).toBe(false)
    })

    it('returns false when no tasks exist for the company', () => {
      expect(repo.hasActiveCompanyTask('non-existent-company')).toBe(false)
    })

    it('returns false when active tasks exist for a different company', () => {
      repo.enqueue(
        buildQueueItem({
          type: 'company',
          status: 'pending',
          company_id: 'other-company'
        })
      )

      expect(repo.hasActiveCompanyTask('my-company')).toBe(false)
    })

    it('ignores non-company task types', () => {
      repo.enqueue(
        buildQueueItem({
          type: 'job',
          status: 'pending',
          company_id: 'company-job'
        })
      )

      expect(repo.hasActiveCompanyTask('company-job')).toBe(false)
    })
  })
})
