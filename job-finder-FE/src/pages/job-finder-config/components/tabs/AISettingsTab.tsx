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
import type { AISettings, AIProviderType, AIInterfaceType } from "@shared/types"
import { AI_PROVIDER_MODELS } from "@shared/types"
import type { ConfigState } from "../../hooks/useConfigState"

type AISettingsTabProps = Pick<
  ConfigState,
  | "isSaving"
  | "aiSettings"
  | "setAISettings"
  | "hasAIChanges"
  | "handleSaveAISettings"
  | "handleResetAISettings"
>

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
  handleResetAISettings,
}: AISettingsTabProps) {
  const selectedProvider = aiSettings?.selected?.provider ?? "codex"
  const selectedInterface = aiSettings?.selected?.interface ?? "cli"
  const selectedModel = aiSettings?.selected?.model ?? "gpt-4o-mini"
  const providers = aiSettings?.providers ?? []

  // Get the current provider's status
  const currentProviderStatus = providers.find(
    (p) => p.provider === selectedProvider && p.interface === selectedInterface
  )

  // Get available interfaces for the selected provider
  const getInterfacesForProvider = (provider: AIProviderType): AIInterfaceType[] => {
    const interfaces = Object.keys(
      AI_PROVIDER_MODELS[provider] ?? {}
    ) as AIInterfaceType[]
    return interfaces.length > 0 ? interfaces : ["api"]
  }

  // Get available models for the selected provider/interface
  const getModelsForSelection = (
    provider: AIProviderType,
    iface: AIInterfaceType
  ): string[] => {
    const providerModels = AI_PROVIDER_MODELS[provider]
    if (!providerModels) return []
    const interfaceModels = (providerModels as Record<string, readonly string[]>)[iface]
    return interfaceModels ? [...interfaceModels] : []
  }

  const availableInterfaces = getInterfacesForProvider(selectedProvider)
  const availableModels = getModelsForSelection(selectedProvider, selectedInterface)

  // Check if a provider is enabled
  const isProviderEnabled = (provider: AIProviderType): boolean => {
    const status = providers.find((p) => p.provider === provider)
    return status?.enabled ?? false
  }

  // Get reason why provider is disabled
  const getDisabledReason = (provider: AIProviderType): string | undefined => {
    const status = providers.find((p) => p.provider === provider)
    return status?.reason
  }

  const handleProviderChange = (newProvider: AIProviderType) => {
    const newInterfaces = getInterfacesForProvider(newProvider)
    const newInterface = newInterfaces[0] ?? "api"
    const newModels = getModelsForSelection(newProvider, newInterface)
    const newModel = newModels[0] ?? ""

    setAISettings((prev: AISettings | null) =>
      prev
        ? {
            ...prev,
            selected: {
              provider: newProvider,
              interface: newInterface,
              model: newModel,
            },
          }
        : null
    )
  }

  const handleInterfaceChange = (newInterface: AIInterfaceType) => {
    const newModels = getModelsForSelection(selectedProvider, newInterface)
    const newModel = newModels[0] ?? ""

    setAISettings((prev: AISettings | null) =>
      prev
        ? {
            ...prev,
            selected: {
              ...prev.selected,
              interface: newInterface,
              model: newModel,
            },
          }
        : null
    )
  }

  const handleModelChange = (newModel: string) => {
    setAISettings((prev: AISettings | null) =>
      prev
        ? {
            ...prev,
            selected: {
              ...prev.selected,
              model: newModel,
            },
          }
        : null
    )
  }

  return (
    <TabsContent value="ai" className="space-y-4 mt-4">
      <TabCard
        title="AI Provider Configuration"
        description="Select the AI provider, interface, and model for job matching and document generation"
        hasChanges={hasAIChanges}
        isSaving={isSaving}
        onSave={handleSaveAISettings}
        onReset={handleResetAISettings}
      >
        <div className="grid grid-cols-3 gap-6">
          {/* Provider Selection */}
          <div className="space-y-2">
            <Label htmlFor="provider">Provider</Label>
            <Select value={selectedProvider} onValueChange={handleProviderChange}>
              <SelectTrigger id="provider">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["codex", "claude", "openai", "gemini"] as AIProviderType[]).map(
                  (provider) => {
                    const enabled = isProviderEnabled(provider)
                    const reason = getDisabledReason(provider)

                    return (
                      <SelectItem
                        key={provider}
                        value={provider}
                        disabled={!enabled}
                        className={!enabled ? "text-gray-400" : ""}
                      >
                        {PROVIDER_LABELS[provider]}
                        {!enabled && reason && (
                          <span className="ml-2 text-xs text-gray-400">({reason})</span>
                        )}
                      </SelectItem>
                    )
                  }
                )}
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500">
              AI service provider for all AI operations
            </p>
          </div>

          {/* Interface Selection */}
          <div className="space-y-2">
            <Label htmlFor="interface">Interface</Label>
            <Select
              value={selectedInterface}
              onValueChange={(v) => handleInterfaceChange(v as AIInterfaceType)}
            >
              <SelectTrigger id="interface">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableInterfaces.map((iface) => (
                  <SelectItem key={iface} value={iface}>
                    {INTERFACE_LABELS[iface]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500">
              How to connect to the provider
            </p>
          </div>

          {/* Model Selection */}
          <div className="space-y-2">
            <Label htmlFor="model">Model</Label>
            <Select value={selectedModel} onValueChange={handleModelChange}>
              <SelectTrigger id="model">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableModels.map((model) => (
                  <SelectItem key={model} value={model}>
                    {model}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500">
              Specific model version to use
            </p>
          </div>
        </div>

        {/* Provider Status */}
        {currentProviderStatus && (
          <div className="mt-4 p-3 rounded-md bg-gray-50 dark:bg-gray-900">
            <div className="flex items-center gap-2">
              <div
                className={`w-2 h-2 rounded-full ${
                  currentProviderStatus.enabled ? "bg-green-500" : "bg-red-500"
                }`}
              />
              <span className="text-sm">
                {currentProviderStatus.enabled
                  ? "Provider is enabled and ready"
                  : `Provider unavailable: ${currentProviderStatus.reason}`}
              </span>
            </div>
          </div>
        )}
      </TabCard>
    </TabsContent>
  )
}
