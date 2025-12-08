import { ApiErrorCode, type QueueItem, type QueueSource, type QueueStats, type QueueStatus, type ScrapeConfig } from '@shared/types'
import { JobQueueRepository, type NewQueueItem, type QueueItemUpdate } from './job-queue.repository'
import { ApiHttpError } from '../../middleware/api-error'


export type SubmitJobInput = {
  url: string
  companyName?: string
  companyUrl?: string
  source?: QueueSource
  companyId?: string | null
  generationId?: string
  title?: string
  description?: string
  location?: string
  techStack?: string
  bypassFilter?: boolean
  metadata?: Record<string, unknown>
}

export type SubmitCompanyInput = {
  companyName: string
  websiteUrl?: string
  companyId?: string | null
  source?: QueueSource
  allowReanalysis?: boolean
}

export type SubmitScrapeInput = {
  scrapeConfig?: ScrapeConfig
}

export type SubmitSourceDiscoveryInput = {
  url: string
  companyName?: string
  companyId?: string | null
  typeHint?: 'auto' | 'greenhouse' | 'ashby' | 'workday' | 'rss' | 'generic'
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

  listWithTotal(options: ListQueueOptions = {}): { items: QueueItem[]; total: number } {
    return this.repo.listWithTotal(options)
  }

  submitJob(input: SubmitJobInput): QueueItem {
    const now = new Date()
    const hasPrebuiltDocs = Boolean(input.generationId)
    const metadata = {
      ...(input.metadata ?? {}),
      ...(input.companyUrl ? { companyUrl: input.companyUrl } : {}),
      ...(input.title ? { manualTitle: input.title } : {}),
      ...(input.description ? { manualDescription: input.description } : {}),
      ...(input.location ? { manualLocation: input.location } : {}),
      ...(input.techStack ? { manualTechStack: input.techStack } : {}),
      ...(input.bypassFilter ? { bypassFilter: true } : {}),
      ...(input.companyName ? { manualCompanyName: input.companyName } : {})
    }

    const item: NewQueueItem = {
      type: 'job',
      status: hasPrebuiltDocs ? 'success' : 'pending',
      url: input.url,
      company_name: input.companyName ?? '',
      company_id: input.companyId ?? null,
      source: input.source ?? 'user_submission',
      submitted_by: null,
      created_at: now,
      updated_at: now,
      metadata: Object.keys(metadata).length ? metadata : undefined,
      result_message: hasPrebuiltDocs ? 'Generated via document builder' : undefined,
      completed_at: hasPrebuiltDocs ? now : undefined
    }

    return this.repo.enqueue(item)
  }

  submitCompany(input: SubmitCompanyInput): QueueItem {
    // Check if there's already an active task for this company
    if (input.companyId && this.repo.hasActiveCompanyTask(input.companyId)) {
      throw new ApiHttpError(
        ApiErrorCode.ALREADY_EXISTS,
        'A re-analysis task for this company is already in the queue'
      )
    }

    const now = new Date()
    const item: NewQueueItem = {
      type: 'company',
      status: 'pending',
      url: input.websiteUrl ?? '',
      company_name: input.companyName,
      company_id: input.companyId ?? null,
      source: input.source ?? 'manual_submission',
      submitted_by: null,
      created_at: now,
      updated_at: now
    }

    return this.repo.enqueue(item)
  }

  submitScrape(input: SubmitScrapeInput): QueueItem {
    const now = new Date()
    const normalize = (value?: number | null) => (value === 0 ? null : value ?? null)
    const cfg = input.scrapeConfig ?? {}
    const scrapeConfig = {
      target_matches: normalize(cfg.target_matches),
      max_sources: normalize(cfg.max_sources),
      source_ids: cfg.source_ids
    }
    const item: NewQueueItem = {
      type: 'scrape',
      status: 'pending',
      url: '',
      company_name: '',
      company_id: null,
      source: 'automated_scan',
      submitted_by: null,
      created_at: now,
      updated_at: now,
      scrape_config: scrapeConfig
    }

    return this.repo.enqueue(item)
  }

  submitSourceDiscovery(input: SubmitSourceDiscoveryInput): QueueItem {
    const now = new Date()
    const item: NewQueueItem = {
      type: 'source_discovery',
      status: 'pending',
      url: input.url,
      company_name: input.companyName ?? '',
      company_id: input.companyId ?? null,
      source: 'user_submission',
      submitted_by: null,
      created_at: now,
      updated_at: now,
      source_discovery_config: {
        url: input.url,
        type_hint: input.typeHint ?? 'auto',
        company_id: input.companyId ?? null,
        company_name: input.companyName ?? null
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
    const existing = this.repo.getById(id)
    if (!existing) {
      throw new Error(`Queue item not found: ${id}`)
    }

    if (updates.status === 'pending' && existing.status !== 'pending') {
      throw new Error('Retry is disabled; items cannot be moved back to pending')
    }

    return this.repo.update(id, updates)
  }

  delete(id: string): void {
    this.repo.delete(id)
  }
}
