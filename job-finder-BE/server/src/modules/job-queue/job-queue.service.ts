import type { QueueItem, QueueSource, QueueStats, QueueStatus, ScrapeConfig } from '@shared/types'
import { JobQueueRepository, type NewQueueItem, type QueueItemUpdate } from './job-queue.repository'

const DEFAULT_MAX_RETRIES = 3

export type SubmitJobInput = {
  url: string
  companyName?: string
  companyUrl?: string
  source?: QueueSource
  companyId?: string | null
  generationId?: string
  metadata?: Record<string, unknown>
}

export type SubmitCompanyInput = {
  companyName: string
  websiteUrl: string
  source?: QueueSource
}

export type SubmitScrapeInput = {
  scrapeConfig?: ScrapeConfig
}

type ListQueueOptions = {
  status?: QueueStatus | QueueStatus[]
  type?: QueueItem['type']
  source?: QueueSource
  limit?: number
  offset?: number
}

export class JobQueueService {
  constructor(private readonly repo = new JobQueueRepository()) {}

  list(options: ListQueueOptions = {}): QueueItem[] {
    return this.repo.list(options)
  }

  submitJob(input: SubmitJobInput): QueueItem {
    const now = new Date()
    const hasPrebuiltDocs = Boolean(input.generationId)
    const metadata = {
      ...(input.metadata ?? {}),
      ...(input.companyUrl ? { companyUrl: input.companyUrl } : {})
    }

    const item: NewQueueItem = {
      type: 'job',
      status: hasPrebuiltDocs ? 'success' : 'pending',
      url: input.url,
      company_name: input.companyName ?? '',
      company_id: input.companyId ?? null,
      source: input.source ?? 'user_submission',
      submitted_by: null,
      retry_count: 0,
      max_retries: DEFAULT_MAX_RETRIES,
      created_at: now,
      updated_at: now,
      metadata: Object.keys(metadata).length ? metadata : undefined,
      result_message: hasPrebuiltDocs ? 'Generated via document builder' : undefined,
      completed_at: hasPrebuiltDocs ? now : undefined
    }

    return this.repo.enqueue(item)
  }

  submitCompany(input: SubmitCompanyInput): QueueItem {
    const now = new Date()
    const item: NewQueueItem = {
      type: 'company',
      status: 'pending',
      url: input.websiteUrl,
      company_name: input.companyName,
      company_id: null,
      source: input.source ?? 'manual_submission',
      submitted_by: null,
      retry_count: 0,
      max_retries: DEFAULT_MAX_RETRIES,
      created_at: now,
      updated_at: now,
      company_sub_task: 'fetch'
    }

    return this.repo.enqueue(item)
  }

  submitScrape(input: SubmitScrapeInput): QueueItem {
    const now = new Date()
    const item: NewQueueItem = {
      type: 'scrape',
      status: 'pending',
      url: '',
      company_name: '',
      company_id: null,
      source: 'automated_scan',
      submitted_by: null,
      retry_count: 0,
      max_retries: DEFAULT_MAX_RETRIES,
      created_at: now,
      updated_at: now,
      scrape_config: input.scrapeConfig ?? {
        target_matches: 5,
        max_sources: 20
      }
    }

    return this.repo.enqueue(item)
  }

  getItem(id: string): QueueItem | null {
    return this.repo.getById(id)
  }

  getStats(): QueueStats {
    return this.repo.getStats()
  }

  update(id: string, updates: QueueItemUpdate): QueueItem {
    return this.repo.update(id, updates)
  }

  delete(id: string): void {
    this.repo.delete(id)
  }
}
