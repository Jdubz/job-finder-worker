export type AgentCliProvider = 'claude'

export interface AgentCliStatus {
  healthy: boolean
  message: string
}

/** Per-model health from LiteLLM /health endpoint */
export interface LitellmModelHealth {
  model: string
  modelGroup: string
  healthy: boolean
  error?: string
}

export interface AgentCliHealth {
  backend: Record<AgentCliProvider, AgentCliStatus>
  worker: {
    reachable: boolean
    providers?: Record<AgentCliProvider, AgentCliStatus>
    error?: string
    workerUrl?: string
  }
  /** Per-model health from LiteLLM proxy (empty if proxy unreachable) */
  models?: LitellmModelHealth[]
}
