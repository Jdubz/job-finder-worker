export type AgentCliProvider = 'codex' | 'gemini'

export interface AgentCliStatus {
  healthy: boolean
  message: string
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
