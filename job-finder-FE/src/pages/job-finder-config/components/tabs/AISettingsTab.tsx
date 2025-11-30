import { TabsContent } from "@/components/ui/tabs"
import { Label } from "@/components/ui/label"
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
} from "@shared/types"
import { DEFAULT_AI_SETTINGS } from "@shared/types"
type AISettingsTabProps = {
  isSaving: boolean
  aiSettings: AISettings
  setAISettings: (updater: (prev: AISettings) => AISettings) => void
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

export function AISettingsTab({
  isSaving,
  aiSettings,
  setAISettings,
  hasAIChanges,
  handleSaveAISettings,
  resetAI,
}: AISettingsTabProps) {
  const options: AIProviderOption[] = aiSettings?.options ?? DEFAULT_AI_SETTINGS.options ?? []
  const defaultSelection: AISettings["worker"]["selected"] =
    DEFAULT_AI_SETTINGS?.worker?.selected ?? { provider: "codex", interface: "cli", model: "gpt-4o" }

  const getSectionSelection = (section: "worker" | "documentGenerator") => {
    const selected = aiSettings?.[section]?.selected
    if (selected) return selected

    const defaultSection =
      (DEFAULT_AI_SETTINGS as Pick<AISettings, "worker" | "documentGenerator"> | undefined)?.[section]
    if (defaultSection?.selected) return defaultSection.selected

    return defaultSelection
  }

  const resolveProvider = (provider: AIProviderType): AIProviderOption | undefined =>
    options.find((p: AIProviderOption) => p.value === provider)

  const resolveInterface = (provider: AIProviderType, iface: AIInterfaceType) =>
    resolveProvider(provider)?.interfaces.find((i: AIInterfaceOption) => i.value === iface)

  const updateSelection = (
    section: "worker" | "documentGenerator",
    selection: { provider: AIProviderType; interface: AIInterfaceType; model: string }
  ) => {
    setAISettings((prev: AISettings | null) => {
      const base = prev ?? DEFAULT_AI_SETTINGS
      return {
        ...base,
        options,
        [section]: {
          selected: selection,
        },
      }
    })
  }

  const chooseFallbackInterface = (provider: AIProviderType) => {
    const providerOption = resolveProvider(provider)
    if (!providerOption) return { interface: "api" as AIInterfaceType, model: "" }
    const iface = providerOption.interfaces.find((i: AIInterfaceOption) => i.enabled) ?? providerOption.interfaces[0]
    const model = iface?.models[0] ?? ""
    return { interface: (iface?.value ?? "api") as AIInterfaceType, model }
  }

  const handleProviderChange = (section: "worker" | "documentGenerator", provider: AIProviderType) => {
    const fallback = chooseFallbackInterface(provider)
    updateSelection(section, {
      provider,
      interface: fallback.interface,
      model: fallback.model,
    })
  }

  const handleInterfaceChange = (
    section: "worker" | "documentGenerator",
    provider: AIProviderType,
    iface: AIInterfaceType
  ) => {
    const ifaceOption = resolveInterface(provider, iface)
    const model = ifaceOption?.models[0] ?? ""
    updateSelection(section, { provider, interface: iface, model })
  }

  const handleModelChange = (
    section: "worker" | "documentGenerator",
    provider: AIProviderType,
    iface: AIInterfaceType,
    model: string
  ) => {
    updateSelection(section, { provider, interface: iface, model })
  }

  const isProviderEnabled = (provider: AIProviderType) => {
    const providerOption = resolveProvider(provider)
    return providerOption?.interfaces.some((iface: AIInterfaceOption) => iface.enabled) ?? false
  }

  const getProviderDisabledReason = (provider: AIProviderType): string | undefined => {
    const providerOption = resolveProvider(provider)
    const firstReason = providerOption?.interfaces.find((iface: AIInterfaceOption) => !iface.enabled)?.reason
    return firstReason
  }

  const renderSelector = (section: "worker" | "documentGenerator", title: string, description: string) => {
    const selected = getSectionSelection(section)
    const providerOption = resolveProvider(selected.provider)
    const availableInterfaces: AIInterfaceOption[] = providerOption?.interfaces ?? []
    const interfaceOption =
      availableInterfaces.find((i: AIInterfaceOption) => i.value === selected.interface) ?? availableInterfaces[0]
    const models = interfaceOption?.models ?? []

    return (
      <div className="space-y-4">
        <h3 className="text-lg font-medium">{title}</h3>
        <div className="grid grid-cols-3 gap-6">
          <div className="space-y-2">
            <Label htmlFor={`${section}-provider`}>Provider</Label>
            <Select
              value={selected.provider}
              onValueChange={(value) => handleProviderChange(section, value as AIProviderType)}
            >
              <SelectTrigger id={`${section}-provider`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(options.map((opt) => opt.value) as AIProviderType[]).map((provider) => {
                  const enabled = isProviderEnabled(provider)
                  const reason = getProviderDisabledReason(provider)
                  return (
                    <SelectItem key={provider} value={provider} disabled={!enabled}>
                      {PROVIDER_LABELS[provider]}
                      {!enabled && reason && (
                        <span className="ml-2 text-xs text-gray-400">({reason})</span>
                      )}
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500">{description}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor={`${section}-interface`}>Interface</Label>
            <Select
              value={interfaceOption?.value ?? selected.interface}
              onValueChange={(value) =>
                handleInterfaceChange(section, selected.provider, value as AIInterfaceType)
              }
            >
              <SelectTrigger id={`${section}-interface`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableInterfaces.map((iface) => (
                  <SelectItem key={iface.value} value={iface.value} disabled={!iface.enabled}>
                    {INTERFACE_LABELS[iface.value]}
                    {!iface.enabled && iface.reason && (
                      <span className="ml-2 text-xs text-gray-400">({iface.reason})</span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500">How to connect to the provider</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor={`${section}-model`}>Model</Label>
            <Select
              value={selected.model}
              onValueChange={(value) =>
                handleModelChange(section, selected.provider, interfaceOption?.value ?? selected.interface, value)
              }
            >
              <SelectTrigger id={`${section}-model`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {models.map((model) => (
                  <SelectItem key={model} value={model}>
                    {model}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500">Specific model version to use</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <TabsContent value="ai" className="space-y-4 mt-4">
      <TabCard
        title="AI Provider Configuration"
        description="Separate agents for the worker pipeline and document generator with validated provider/interface/model chains."
        hasChanges={hasAIChanges}
        isSaving={isSaving}
        onSave={handleSaveAISettings}
        onReset={resetAI}
      >
        <div className="space-y-8">
          {renderSelector(
            "worker",
            "Worker AI agent",
            "Provider chain for scraping, filtering, and queue processing."
          )}
          {renderSelector(
            "documentGenerator",
            "Document generator AI agent",
            "Provider chain for resume/cover letter generation."
          )}
        </div>
      </TabCard>
    </TabsContent>
  )
}
