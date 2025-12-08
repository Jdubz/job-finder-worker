import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Logger } from 'pino'
import type { AISettings, AgentConfig, AgentId, AgentScope, AgentTaskType } from '@shared/types'
import { ConfigRepository } from '../../config/config.repository'
import { logger } from '../../../logger'
import { runCliProvider, type CliProvider, type CliErrorType } from '../workflow/services/cli-runner'
import { UserFacingError } from '../workflow/generator.workflow.service'

type AgentExecutionResult = {
  output: string
  agentId: string
  model: string | undefined
}

class NoAgentsAvailableError extends Error {
  constructor(message: string, readonly taskType: AgentTaskType, readonly triedAgents: string[]) {
    super(message)
  }
}

/** Errors that should continue to the next agent in the fallback chain */
class QuotaExhaustedError extends Error {
  constructor(message: string, readonly agentId: string) {
    super(message)
  }
}

/** Errors that should stop the fallback chain (systemic issues) */
class AgentExecutionError extends Error {
  constructor(message: string, readonly agentId: string, readonly errorType: CliErrorType) {
    super(message)
  }
}

function expandHome(filePath: string): string {
  if (!filePath.startsWith('~')) return filePath
  return join(homedir(), filePath.slice(1))
}

export class AgentManager {
  private readonly scope: AgentScope = 'backend'

  constructor(private readonly configRepo = new ConfigRepository(), private readonly log: Logger = logger) {}

  ensureAvailable(taskType: AgentTaskType): void {
    const entry = this.configRepo.get<AISettings>('ai-settings')
    if (!entry?.payload) {
      throw new UserFacingError('AI settings not configured. Please configure ai-settings in the database.')
    }
    const chain = entry.payload.taskFallbacks?.[taskType]
    if (!Array.isArray(chain) || chain.length === 0) {
      throw new UserFacingError(`No fallback chain configured for task ${taskType}`)
    }

    const agents = entry.payload.agents
    const hasEnabled = chain.some((agentId) => agents?.[agentId]?.runtimeState?.[this.scope]?.enabled)
    if (!hasEnabled) {
      throw new UserFacingError(`No enabled agents for task ${taskType} in scope ${this.scope}`)
    }
  }

  async execute(taskType: AgentTaskType, prompt: string, modelOverride?: string): Promise<AgentExecutionResult> {
    const entry = this.configRepo.get<AISettings>('ai-settings')
    if (!entry?.payload) {
      throw new UserFacingError('AI settings not configured. Please configure ai-settings in the database.')
    }

    const aiSettings = entry.payload
    const chain = aiSettings.taskFallbacks?.[taskType]

    if (!Array.isArray(chain) || chain.length === 0) {
      throw new NoAgentsAvailableError(`No fallback chain configured for ${taskType}`, taskType, [])
    }

    const tried: string[] = []

    for (const agentId of chain) {
      const agent = aiSettings.agents?.[agentId]
      if (!agent) {
        this.log.warn({ agentId }, 'Agent in fallback chain not found')
        continue
      }
      tried.push(agentId)

      const scopeState = agent.runtimeState?.[this.scope]
      if (!scopeState) {
        throw new NoAgentsAvailableError(`Missing runtimeState for scope ${this.scope}`, taskType, tried)
      }
      if (!scopeState.enabled) {
        this.log.debug({ agentId, reason: scopeState.reason }, 'Skipping disabled agent for backend scope')
        continue
      }

      const authError = this.checkAuth(agent)
      if (authError) {
        this.disableAgent(aiSettings, agentId, authError)
        continue
      }

      // Determine model - "default" or empty means CLI uses its own default
      const rawModel = modelOverride ?? agent.defaultModel
      const model = rawModel && rawModel !== 'default' ? rawModel : undefined
      // Cost defaults to 1.0 when model is undefined (CLI using its default)
      const cost = model ? (aiSettings.modelRates?.[model] ?? 1) : 1
      if (agent.dailyUsage + cost > agent.dailyBudget) {
        this.disableAgent(aiSettings, agentId, 'quota_exhausted: daily budget reached')
        continue
      }

      try {
        const output = await this.runAgent(agent, agentId, prompt, model)
        agent.dailyUsage += cost
        this.persist(aiSettings)
        return { output, agentId, model }
      } catch (err) {
        if (err instanceof QuotaExhaustedError) {
          // Quota errors: disable agent and continue to next in fallback chain
          this.log.warn({ agentId, error: err.message }, 'Agent quota exhausted, trying next agent')
          this.disableAgent(aiSettings, agentId, `quota_exhausted: ${err.message}`)
          continue
        }

        if (err instanceof AgentExecutionError) {
          // Non-quota errors: disable agent and throw immediately (systemic issues)
          this.log.error({ agentId, error: err.message, errorType: err.errorType }, 'Agent execution failed')
          this.disableAgent(aiSettings, agentId, `error: ${err.message}`)
          throw new UserFacingError(`AI generation failed: ${err.message}`)
        }

        // Unknown errors: disable and re-throw
        const reason = err instanceof Error ? err.message : 'agent failed'
        this.disableAgent(aiSettings, agentId, `error: ${reason}`)
        throw err
      }
    }

    throw new NoAgentsAvailableError(
      `No agents available for task ${taskType}. Tried: ${tried.join(', ')}`,
      taskType,
      tried
    )
  }

  private checkAuth(agent: AgentConfig): string | null {
    const { authRequirements } = agent
    const envList = authRequirements.requiredEnv ?? []
    const fileList = authRequirements.requiredFiles ?? []

    const envSatisfied = envList.length === 0 ? false : envList.some((env) => !!process.env[env])
    const fileSatisfied = fileList.length === 0 ? false : fileList.some((file) => existsSync(expandHome(file)))

    const authOk = envList.length && fileList.length ? envSatisfied || fileSatisfied : envList.length ? envSatisfied : fileList.length ? fileSatisfied : true

    if (authOk) return null

    const parts: string[] = []
    if (envList.length) parts.push(`missing_env:any_of:${envList.join(',')}`)
    if (fileList.length) parts.push(`missing_file:any_of:${fileList.join(',')}`)
    return parts.join('|')
  }

  private async runAgent(agent: AgentConfig, agentId: string, prompt: string, model: string | undefined): Promise<string> {
    if (agent.interface !== 'cli') {
      throw new UserFacingError(`Interface ${agent.interface} not supported for generator tasks`)
    }
    const provider = agent.provider as CliProvider
    const result = await runCliProvider(prompt, provider, { model })

    if (!result.success) {
      const errorMsg = result.error || 'AI generation failed'
      const errorType = result.errorType || 'other'

      // Throw appropriate error type based on CLI result
      if (errorType === 'quota') {
        throw new QuotaExhaustedError(errorMsg, agentId)
      }

      // Auth, timeout, not_found, and other errors are considered systemic
      throw new AgentExecutionError(errorMsg, agentId, errorType)
    }

    return result.output
  }

  private disableAgent(aiSettings: AISettings, agentId: AgentId, reason: string): void {
    const agent = aiSettings.agents?.[agentId]
    if (!agent) {
      throw new UserFacingError(`Agent ${agentId} missing from ai-settings`)
    }
    agent.runtimeState[this.scope] = { enabled: false, reason }
    this.persist(aiSettings)
    this.log.warn({ agentId, scope: this.scope, reason }, 'Disabled agent')
  }

  private persist(aiSettings: AISettings): void {
    this.configRepo.upsert('ai-settings', aiSettings, { updatedBy: 'agent-manager-backend' })
  }
}

export { NoAgentsAvailableError, QuotaExhaustedError, AgentExecutionError, AgentExecutionResult }
