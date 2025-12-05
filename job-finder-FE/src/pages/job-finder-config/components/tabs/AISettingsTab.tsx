import { TabsContent } from "@/components/ui/tabs"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { TabCard } from "../shared"
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
  analysis: "Match Analysis",
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
  const docGen = aiSettings.documentGenerator?.selected

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
        enabled: false,
        reason: null,
        dailyBudget: 100,
        dailyUsage: 0,
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

  const updateDocGenSelection = (
    selection: { provider: AIProviderType; interface: AIInterfaceType; model: string }
  ) => {
    setAISettings((prev) => {
      if (!prev) return null
      return {
        ...prev,
        documentGenerator: { selected: selection },
      }
    })
  }

  const resolveProvider = (provider: AIProviderType): AIProviderOption | undefined =>
    options.find((p: AIProviderOption) => p.value === provider)

  const resolveInterface = (provider: AIProviderType, iface: AIInterfaceType) =>
    resolveProvider(provider)?.interfaces.find((i: AIInterfaceOption) => i.value === iface)

  const chooseFallbackInterface = (provider: AIProviderType) => {
    const providerOption = resolveProvider(provider)
    if (!providerOption) return { interface: "api" as AIInterfaceType, model: "" }
    const iface = providerOption.interfaces.find((i: AIInterfaceOption) => i.enabled) ?? providerOption.interfaces[0]
    const model = iface?.models[0] ?? ""
    return { interface: (iface?.value ?? "api") as AIInterfaceType, model }
  }

  const firstProvider = options[0]
  const firstInterface = firstProvider?.interfaces[0]

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
                const reasonBadge = getReasonBadge(config.reason)
                return (
                  <div key={agentId} className="flex items-center justify-between border rounded-md p-4">
                    <div className="flex items-center gap-4">
                      <Switch
                        checked={config.enabled}
                        onCheckedChange={(enabled) => updateAgent(agentId as AgentId, { enabled })}
                        disabled={!!config.reason?.startsWith("error:")}
                      />
                      <div>
                        <div className="font-medium">{formatAgentId(agentId as AgentId)}</div>
                        <div className="text-sm text-muted-foreground">
                          Model: {config.defaultModel || "Not set"}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      {reasonBadge && (
                        <Badge variant={reasonBadge.variant}>{reasonBadge.label}</Badge>
                      )}
                      <div className="text-right">
                        <div className="text-sm">
                          Usage: {config.dailyUsage} / {config.dailyBudget}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <Label className="text-xs">Budget:</Label>
                          <Input
                            type="number"
                            min="1"
                            value={config.dailyBudget}
                            onChange={(e) => {
                              const value = parseInt(e.target.value, 10)
                              if (value > 0) {
                                updateAgent(agentId as AgentId, { dailyBudget: value })
                              }
                            }}
                            className="w-20 h-7 text-sm"
                          />
                        </div>
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
              Configure the order of agents to try for each task type. First available agent is used.
            </p>
            <div className="space-y-4">
              {(["extraction", "analysis"] as AgentTaskType[]).map((taskType) => {
                const fallbacks = taskFallbacks[taskType] ?? []
                return (
                  <div key={taskType} className="border rounded-md p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="font-medium">{TASK_LABELS[taskType]}</span>
                      <span className="text-xs text-muted-foreground">({taskType})</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {fallbacks.map((agentId, index) => (
                        <Badge key={`${agentId}-${index}`} variant="outline" className="text-sm">
                          {index + 1}. {formatAgentId(agentId)}
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

          {/* Document Generator */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Document Generator</h3>
            <p className="text-sm text-muted-foreground">
              AI provider for resume/cover letter generation.
            </p>
            {firstProvider && firstInterface && docGen && (
              <div className="grid grid-cols-3 gap-6">
                <div className="space-y-2">
                  <Label>Provider</Label>
                  <Select
                    value={docGen.provider}
                    onValueChange={(value) => {
                      const fallback = chooseFallbackInterface(value as AIProviderType)
                      updateDocGenSelection({
                        provider: value as AIProviderType,
                        interface: fallback.interface,
                        model: fallback.model,
                      })
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {options.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {PROVIDER_LABELS[opt.value]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Interface</Label>
                  <Select
                    value={docGen.interface}
                    onValueChange={(value) => {
                      const ifaceOption = resolveInterface(docGen.provider, value as AIInterfaceType)
                      updateDocGenSelection({
                        provider: docGen.provider,
                        interface: value as AIInterfaceType,
                        model: ifaceOption?.models[0] ?? "",
                      })
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {resolveProvider(docGen.provider)?.interfaces.map((iface) => (
                        <SelectItem key={iface.value} value={iface.value}>
                          {INTERFACE_LABELS[iface.value]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Model</Label>
                  <Select
                    value={docGen.model}
                    onValueChange={(value) => {
                      updateDocGenSelection({
                        provider: docGen.provider,
                        interface: docGen.interface,
                        model: value,
                      })
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {resolveInterface(docGen.provider, docGen.interface)?.models.map((model) => (
                        <SelectItem key={model} value={model}>
                          {model}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>
        </div>
      </TabCard>
    </TabsContent>
  )
}
