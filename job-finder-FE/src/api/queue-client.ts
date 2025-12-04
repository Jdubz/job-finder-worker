import { BaseApiClient } from "./base-client"
import { API_CONFIG } from "@/config/api"
import type {
  ListQueueItemsResponse,
  SubmitJobRequest,
  SubmitJobResponse,
  SubmitCompanyRequest,
  SubmitCompanyResponse,
  SubmitScrapeRequest,
  SubmitScrapeResponse,
  SubmitSourceDiscoveryRequest,
  SubmitSourceDiscoveryResponse,
  GetQueueStatsResponse,
  GetQueueItemResponse,
  UpdateJobStatusResponse,
  QueueItem,
  AgentCliProvider,
  AgentCliStatus
} from "@shared/types"
import type { ApiSuccessResponse } from "@shared/types"

export interface ListQueueParams {
  status?: string | string[]
  type?: string
  source?: string
  limit?: number
  offset?: number
}

export class QueueClient extends BaseApiClient {
  constructor(baseUrl: string | (() => string) = () => API_CONFIG.baseUrl) {
    super(baseUrl)
  }

  async listQueueItems(params: ListQueueParams = {}): Promise<ListQueueItemsResponse> {
    const search = new URLSearchParams()
    if (params.status) {
      const statuses = Array.isArray(params.status) ? params.status : [params.status]
      statuses.forEach((status) => search.append("status", status))
    }
    if (params.type) search.append("type", params.type)
    if (params.source) search.append("source", params.source)
    if (typeof params.limit === "number") search.append("limit", String(params.limit))
    if (typeof params.offset === "number") search.append("offset", String(params.offset))

    const query = search.toString()
    const response = await this.get<ApiSuccessResponse<ListQueueItemsResponse>>(
      `/queue${query ? `?${query}` : ""}`
    )
    return response.data
  }

  async getQueueItem(id: string): Promise<GetQueueItemResponse["queueItem"]> {
    const response = await this.get<ApiSuccessResponse<GetQueueItemResponse>>(`/queue/${id}`)
    return response.data.queueItem
  }

  async submitJob(request: SubmitJobRequest): Promise<QueueItem> {
    const response = await this.post<ApiSuccessResponse<SubmitJobResponse>>(`/queue/jobs`, request)
    if (!response.data.queueItem) {
      throw new Error('Queue item not returned from server')
    }
    return response.data.queueItem
  }

  async submitCompany(request: SubmitCompanyRequest): Promise<QueueItem> {
    const response = await this.post<ApiSuccessResponse<SubmitCompanyResponse>>(
      `/queue/companies`,
      request
    )
    if (!response.data.queueItem) {
      throw new Error('Queue item not returned from server')
    }
    return response.data.queueItem
  }

  async submitScrape(request: SubmitScrapeRequest): Promise<QueueItem> {
    const response = await this.post<ApiSuccessResponse<SubmitScrapeResponse>>(
      `/queue/scrape`,
      request
    )
    if (!response.data.queueItem) {
      throw new Error('Queue item not returned from server')
    }
    return response.data.queueItem
  }

  async submitSourceDiscovery(request: SubmitSourceDiscoveryRequest): Promise<QueueItem> {
    const response = await this.post<ApiSuccessResponse<SubmitSourceDiscoveryResponse>>(
      `/queue/sources/discover`,
      request
    )
    if (!response.data.queueItem) {
      throw new Error('Queue item not returned from server')
    }
    return response.data.queueItem
  }

  async updateQueueItem(
    id: string,
    updates: Partial<QueueItem>
  ): Promise<UpdateJobStatusResponse["queueItem"]> {
    const response = await this.patch<ApiSuccessResponse<UpdateJobStatusResponse>>(
      `/queue/${id}`,
      updates
    )
    return response.data.queueItem
  }

  async deleteQueueItem(id: string): Promise<void> {
    await this.delete(`/queue/${id}`)
  }

  async getStats(): Promise<GetQueueStatsResponse["stats"]> {
    const response = await this.get<ApiSuccessResponse<GetQueueStatsResponse>>(`/queue/stats`)
    return response.data.stats
  }

  async getCronStatus(): Promise<CronStatus> {
    const response = await this.get<ApiSuccessResponse<CronStatus>>(`/queue/cron/status`)
    return response.data
  }

  async triggerCronScrape(): Promise<CronTriggerResult> {
    const response = await this.post<ApiSuccessResponse<CronTriggerResult>>(`/queue/cron/trigger/scrape`)
    return response.data
  }

  async triggerCronMaintenance(): Promise<CronTriggerResult> {
    const response = await this.post<ApiSuccessResponse<CronTriggerResult>>(`/queue/cron/trigger/maintenance`)
    return response.data
  }

  async getWorkerHealth(): Promise<WorkerHealth> {
    const response = await this.get<ApiSuccessResponse<WorkerHealth>>(`/queue/worker/health`)
    return response.data
  }

  async getAgentCliHealth(): Promise<AgentCliHealth> {
    const response = await this.get<ApiSuccessResponse<AgentCliHealth>>(`/queue/cli/health`)
    return response.data
  }
}

// Cron and Worker Health types
export interface CronStatus {
  enabled: boolean
  started: boolean
  nodeEnv: string
  expressions: {
    scrape: string
    maintenance: string
    logrotate: string
  }
  workerMaintenanceUrl: string
  logDir: string
}

export interface CronTriggerResult {
  success: boolean
  queueItemId?: string
  status?: number
  error?: string
}

export interface WorkerHealth {
  reachable: boolean
  workerUrl: string
  error?: string
  health?: {
    status: string
    running: boolean
    items_processed: number
    last_poll: string | null
    iteration: number
    last_error: string | null
  }
  status?: {
    worker: Record<string, unknown>
    queue: Record<string, unknown>
    uptime: number
  }
}

export interface AgentCliHealth {
  backend: Record<AgentCliProvider, AgentCliStatus>
  worker: {
    reachable: boolean
    providers?: Record<AgentCliProvider, AgentCliStatus>
    error?: string
    workerUrl?: string
  }
}

export const queueClient = new QueueClient()
