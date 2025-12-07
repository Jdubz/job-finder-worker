import { useState, useEffect } from "react"
import { TabsContent } from "@/components/ui/tabs"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { TabCard } from "../shared"
import { X, RotateCcw, AlertCircle } from "lucide-react"
import type {
  AISettings,
  AIProviderType,
  AIInterfaceType,
  AIProviderOption,
  AIInterfaceOption,
  AgentId,
  AgentConfig,
  AgentTaskType,
} from "@shared/types"

/** Budget input with local state to allow typing without immediate validation */
function BudgetInput({
  value,
  onChange,
}: {
  value: number
  onChange: (value: number) => void
}) {
  const [localValue, setLocalValue] = useState(String(value))

  useEffect(() => {
    setLocalValue(String(value))
  }, [value])

  const handleBlur = () => {
    const parsed = parseInt(localValue, 10)
    if (!isNaN(parsed) && parsed >= 1) {
      onChange(parsed)
    } else {
      // Reset to last valid value if invalid (includes negative numbers)
      setLocalValue(String(value))
    }
  }

  return (
    <Input
      type="number"
      min="1"
      value={localValue}
      onChange={(e) => setLocalValue(e.target.value)}
      onBlur={handleBlur}
      className="w-20 h-8 text-sm"
    />
  )
}

type AISettingsTabProps = {
  isSaving: boolean
  aiSettings: AISettings | null
  setAISettings: (updater: (prev: AISettings | null) => AISettings | null) => void
  hasAIChanges: boolean
  handleSaveAISettings: () => Promise<void> | void
  resetAI: () => void
}

const PROVIDER_LABELS: Record<AIProviderType, string> = {
  codex: "Codex CLI (OpenAI Pro)",
  claude: "Claude (Anthropic)",
  openai: "OpenAI API",
  gemini: "Google Gemini",
}

const INTERFACE_LABELS: Record<AIInterfaceType, string> = {
  cli: "CLI (Command Line)",
  api: "API (Direct)",
}

const TASK_LABELS: Record<AgentTaskType, string> = {
  extraction: "Data Extraction",
  analysis: "Analysis",
  document: "Document Generation",
}

function formatAgentId(agentId: AgentId): string {
  const [provider, iface] = agentId.split(".") as [AIProviderType, AIInterfaceType]
  return `${PROVIDER_LABELS[provider] || provider} (${INTERFACE_LABELS[iface] || iface})`
}

function getReasonBadge(reason: string | null): { variant: "default" | "destructive" | "secondary"; label: string } | null {
  if (!reason) return null
  if (reason.startsWith("quota_exhausted:")) {
    return { variant: "secondary", label: "Quota Exhausted" }
  }
  if (reason.startsWith("error:")) {
    return { variant: "destructive", label: "Error" }
  }
  return { variant: "default", label: reason }
}

export function AISettingsTab({
  isSaving,
  aiSettings,
  setAISettings,
  hasAIChanges,
  handleSaveAISettings,
  resetAI,
}: AISettingsTabProps) {
  if (!aiSettings) {
    return (
      <TabsContent value="ai" className="space-y-4 mt-4">
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6">
          <h3 className="text-lg font-semibold text-destructive">Configuration Missing</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            The ai-settings configuration is not set in the database. Please add it before using this feature.
          </p>
        </div>
      </TabsContent>
    )
  }

  const options: AIProviderOption[] = aiSettings.options ?? []
  const agents = aiSettings.agents ?? {}
  const taskFallbacks = aiSettings.taskFallbacks ?? {}
  const modelRates = aiSettings.modelRates ?? {}

  // Get all possible agent IDs from options
  const availableAgentIds: AgentId[] = []
  for (const provider of options) {
    for (const iface of provider.interfaces) {
      availableAgentIds.push(`${provider.value}.${iface.value}` as AgentId)
    }
  }

  const updateAgent = (agentId: AgentId, updates: Partial<AgentConfig>) => {
    setAISettings((prev) => {
      if (!prev) return null
      const currentAgent = prev.agents?.[agentId] ?? {
        provider: agentId.split(".")[0] as AIProviderType,
        interface: agentId.split(".")[1] as AIInterfaceType,
        defaultModel: "",
        dailyBudget: 100,
        dailyUsage: 0,
        runtimeState: {
          worker: { enabled: false, reason: null },
          backend: { enabled: false, reason: null },
        },
        authRequirements: {
          type: "cli",
          requiredEnv: ["PATH"],
        },
      }
      return {
        ...prev,
        agents: {
          ...prev.agents,
          [agentId]: { ...currentAgent, ...updates },
        },
      }
    })
  }

  const updateTaskFallback = (taskType: AgentTaskType, fallbacks: AgentId[]) => {
    setAISettings((prev) => {
      if (!prev) return null
      return {
        ...prev,
        taskFallbacks: {
          ...prev.taskFallbacks,
          [taskType]: fallbacks,
        },
      }
    })
  }

  const updateModelRate = (model: string, rate: number) => {
    setAISettings((prev) => {
      if (!prev) return null
      return {
        ...prev,
        modelRates: {
          ...prev.modelRates,
          [model]: rate,
        },
      }
    })
  }

  const resolveProvider = (provider: AIProviderType): AIProviderOption | undefined =>
    options.find((p: AIProviderOption) => p.value === provider)

  const resolveInterface = (provider: AIProviderType, iface: AIInterfaceType) =>
    resolveProvider(provider)?.interfaces.find((i: AIInterfaceOption) => i.value === iface)

  return (
    <TabsContent value="ai" className="space-y-4 mt-4">
      <TabCard
        title="AI Agent Configuration"
        description="Configure AI agents, task fallback chains, and usage budgets."
        hasChanges={hasAIChanges}
        isSaving={isSaving}
        onSave={handleSaveAISettings}
        onReset={resetAI}
      >
        <div className="space-y-8">
          {/* Agents Section */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Configured Agents</h3>
            <p className="text-sm text-muted-foreground">
              Enable/disable agents and set daily usage budgets.
            </p>
            <div className="space-y-3">
              {Object.entries(agents).map(([agentId, config]) => {
                if (!config) return null
                const workerState = config.runtimeState?.worker ?? { enabled: false, reason: null }
                const backendState = config.runtimeState?.backend ?? { enabled: false, reason: null }
                const workerBadge = getReasonBadge(workerState.reason ?? null)
                const backendBadge = getReasonBadge(backendState.reason ?? null)
                const [provider, iface] = agentId.split(".") as [AIProviderType, AIInterfaceType]
                const availableModels = resolveInterface(provider, iface)?.models ?? []
                return (
                  <div key={agentId} className="border rounded-md p-4 space-y-3">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-4 flex-wrap">
                        <div className="font-medium min-w-[220px]">{formatAgentId(agentId as AgentId)}</div>
                        <div className="flex items-center gap-6">
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={workerState.enabled}
                              onCheckedChange={(enabled) =>
                                updateAgent(agentId as AgentId, {
                                  runtimeState: {
                                    worker: { enabled, reason: enabled ? null : workerState.reason ?? null },
                                    backend: backendState,
                                  },
                                })
                              }
                            />
                            <span className="text-sm font-medium">Worker</span>
                            {workerBadge && <Badge variant={workerBadge.variant}>{workerBadge.label}</Badge>}
                            {workerState.reason && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  updateAgent(agentId as AgentId, {
                                    runtimeState: {
                                      worker: { enabled: true, reason: null },
                                      backend: backendState,
                                    },
                                  })
                                }
                                title="Clear worker status and re-enable"
                                className="h-7 px-2"
                              >
                                <AlertCircle className="h-4 w-4 mr-1" />
                                Clear
                              </Button>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={backendState.enabled}
                              onCheckedChange={(enabled) =>
                                updateAgent(agentId as AgentId, {
                                  runtimeState: {
                                    worker: workerState,
                                    backend: { enabled, reason: enabled ? null : backendState.reason ?? null },
                                  },
                                })
                              }
                            />
                            <span className="text-sm font-medium">Backend</span>
                            {backendBadge && <Badge variant={backendBadge.variant}>{backendBadge.label}</Badge>}
                            {backendState.reason && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  updateAgent(agentId as AgentId, {
                                    runtimeState: {
                                      worker: workerState,
                                      backend: { enabled: true, reason: null },
                                    },
                                  })
                                }
                                title="Clear backend status and re-enable"
                                className="h-7 px-2"
                              >
                                <AlertCircle className="h-4 w-4 mr-1" />
                                Clear
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-6 pl-2 md:pl-12 flex-wrap">
                      <div className="flex items-center gap-2">
                        <Label className="text-sm">Model:</Label>
                        <Select
                          value={availableModels.includes(config.defaultModel) ? config.defaultModel : ""}
                          onValueChange={(model) => updateAgent(agentId as AgentId, { defaultModel: model })}
                        >
                          <SelectTrigger className={`w-48 h-8 ${!availableModels.includes(config.defaultModel) && config.defaultModel ? "border-destructive" : ""}`}>
                            <SelectValue placeholder={config.defaultModel && !availableModels.includes(config.defaultModel) ? `${config.defaultModel} (invalid)` : "Select model..."} />
                          </SelectTrigger>
                          <SelectContent>
                            {availableModels.map((model) => (
                              <SelectItem key={model} value={model}>
                                {model}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center gap-2">
                        <Label className="text-sm">Budget:</Label>
                        <BudgetInput
                          value={config.dailyBudget}
                          onChange={(value) => updateAgent(agentId as AgentId, { dailyBudget: value })}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">
                          Usage: {config.dailyUsage} / {config.dailyBudget}
                        </span>
                        {config.dailyUsage > 0 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => updateAgent(agentId as AgentId, { dailyUsage: 0 })}
                            title="Reset daily usage"
                            aria-label="Reset daily usage"
                            className="h-7 px-2"
                          >
                            <RotateCcw className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
              {Object.keys(agents).length === 0 && (
                <p className="text-sm text-muted-foreground italic">No agents configured.</p>
              )}
            </div>
          </div>

          {/* Task Fallback Chains */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Task Fallback Chains</h3>
            <p className="text-sm text-muted-foreground">
              Configure the order of agents to try for each task type. First available agent is used. Document
              generation now follows the Document Generation chain here (no separate selector).
            </p>
            <div className="space-y-4">
              {(["extraction", "analysis", "document"] as AgentTaskType[]).map((taskType) => {
                const fallbacks = taskFallbacks[taskType] ?? []
                return (
                  <div key={taskType} className="border rounded-md p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="font-medium">{TASK_LABELS[taskType]}</span>
                      <span className="text-xs text-muted-foreground">({taskType})</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {fallbacks.map((agentId, index) => (
                        <Badge key={`${agentId}-${index}`} variant="outline" className="text-sm flex items-center gap-1">
                          {index + 1}. {formatAgentId(agentId)}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              const updated = fallbacks.filter((_, i) => i !== index)
                              updateTaskFallback(taskType, updated)
                            }}
                            className="ml-1 h-4 w-4 p-0 hover:text-destructive"
                            title="Remove from chain"
                            aria-label="Remove from chain"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </Badge>
                      ))}
                      {fallbacks.length === 0 && (
                        <span className="text-sm text-muted-foreground italic">No fallback chain configured</span>
                      )}
                    </div>
                    <div className="mt-3">
                      <Select
                        value=""
                        onValueChange={(value) => {
                          if (value && !fallbacks.includes(value as AgentId)) {
                            updateTaskFallback(taskType, [...fallbacks, value as AgentId])
                          }
                        }}
                      >
                        <SelectTrigger className="w-64">
                          <SelectValue placeholder="Add agent to chain..." />
                        </SelectTrigger>
                        <SelectContent>
                          {availableAgentIds
                            .filter((id) => !fallbacks.includes(id))
                            .map((agentId) => (
                              <SelectItem key={agentId} value={agentId}>
                                {formatAgentId(agentId)}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Model Rates */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Model Cost Rates</h3>
            <p className="text-sm text-muted-foreground">
              Cost multiplier for budget consumption (1.0 = standard, 0.5 = cheap model).
            </p>
            <div className="grid grid-cols-2 gap-4">
              {Object.entries(modelRates).map(([model, rate]) => (
                <div key={model} className="flex items-center gap-3 border rounded-md p-3">
                  <Label className="flex-1 text-sm font-medium">{model}</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={rate}
                    onChange={(e) => updateModelRate(model, parseFloat(e.target.value) || 1.0)}
                    className="w-20 h-8 text-sm"
                  />
                </div>
              ))}
              {Object.keys(modelRates).length === 0 && (
                <p className="text-sm text-muted-foreground italic col-span-2">No model rates configured.</p>
              )}
            </div>
          </div>

        </div>
      </TabCard>
    </TabsContent>
  )
}
