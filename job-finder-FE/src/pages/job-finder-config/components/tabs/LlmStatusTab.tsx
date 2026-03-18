import { useEffect, useState, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Loader2 } from "lucide-react"
import { queueClient } from "@/api/queue-client"
import { TabCard } from "../shared"
import type { AgentCliHealth } from "@shared/types"

// Keep in sync with infra/litellm-config.yaml and worker ai/task_router.py TASK_MODEL_MAP
const TASK_MODEL_MAP = [
  { task: "extraction", model: "local-extract", provider: "Ollama Gemma3 12B", fallback: "gemini, claude" },
  { task: "analysis", model: "local-extract", provider: "Ollama Gemma3 12B", fallback: "gemini, claude" },
  { task: "document", model: "claude-document", provider: "Claude Sonnet 4.6", fallback: "gemini, local" },
  { task: "chat", model: "claude-document", provider: "Claude Sonnet 4.6", fallback: "gemini, local" },
  { task: "default", model: "gemini-general", provider: "Gemini 2.5 Flash", fallback: "—" },
] as const

const REFRESH_INTERVAL_MS = 30_000

type LlmStatusTabProps = {
  useLocalModels: boolean
  onToggleLocalModels: (enabled: boolean) => void
  hasChanges: boolean
  isSaving: boolean
  onSave: () => void | Promise<void>
  onReset: () => void
}

/** Map model group to a friendly display name */
function modelGroupLabel(group: string): string {
  switch (group) {
    case "claude-document": return "Claude (Document)"
    case "gemini-general": return "Gemini (General)"
    case "local-extract": return "Ollama (Extract)"
    case "local-embed": return "Ollama (Embed)"
    default: return group
  }
}

export function LlmStatusTab({
  useLocalModels,
  onToggleLocalModels,
  hasChanges,
  isSaving,
  onSave,
  onReset,
}: LlmStatusTabProps) {
  const [health, setHealth] = useState<AgentCliHealth | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchHealth = useCallback(async () => {
    try {
      const data = await queueClient.getAgentCliHealth()
      setHealth(data)
      setError(null)
    } catch {
      setHealth(null)
      setError("Failed to fetch LLM health status")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchHealth()
    const interval = setInterval(fetchHealth, REFRESH_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [fetchHealth])

  const litellmHealthy =
    health?.worker?.reachable &&
    health?.worker?.providers &&
    Object.values(health.worker.providers).some((s) => s.healthy)

  // Separate healthy and unhealthy models for clear display
  const models = health?.models ?? []
  const unhealthyModels = models.filter((m) => !m.healthy)
  const healthyModels = models.filter((m) => m.healthy)

  return (
    <div className="space-y-4">
      <TabCard
        title="Local Models"
        description="Control whether extraction/analysis tasks route to Ollama first or skip directly to cloud providers."
        hasChanges={hasChanges}
        isSaving={isSaving}
        onSave={onSave}
        onReset={onReset}
      >
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="local-models-toggle">Enable Local Models (Ollama)</Label>
            <p className="text-xs text-muted-foreground">
              When disabled, extraction and analysis tasks skip Ollama and route directly to Gemini,
              avoiding latency from failed connection attempts.
            </p>
          </div>
          <Switch
            id="local-models-toggle"
            checked={useLocalModels}
            onCheckedChange={onToggleLocalModels}
          />
        </div>
      </TabCard>

      <Card>
        <CardHeader>
          <CardTitle>LLM Status</CardTitle>
          <CardDescription>
            Real-time model health from LiteLLM proxy. Auto-refreshes every 30s.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Proxy health */}
          <div>
            <h3 className="text-sm font-medium mb-2">LiteLLM Proxy</h3>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : error ? (
              <Badge variant="destructive">Error</Badge>
            ) : litellmHealthy ? (
              <Badge variant="default" className="bg-green-600">Healthy</Badge>
            ) : (
              <Badge variant="destructive">Unhealthy</Badge>
            )}
          </div>

          {/* Per-model health from LiteLLM /health */}
          {models.length > 0 && (
            <div>
              <h3 className="text-sm font-medium mb-2">Model Health</h3>
              <div className="space-y-2">
                {/* Show unhealthy models first with error details */}
                {unhealthyModels.map((m) => (
                  <div key={m.model} className="rounded-md border border-destructive/50 bg-destructive/5 p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-sm font-medium">{modelGroupLabel(m.modelGroup)}</span>
                        <span className="text-xs text-muted-foreground ml-2">{m.model}</span>
                      </div>
                      <Badge variant="destructive">Unhealthy</Badge>
                    </div>
                    {m.error && (
                      <p className="text-xs text-destructive mt-1 font-mono">{m.error}</p>
                    )}
                  </div>
                ))}
                {/* Healthy models */}
                {healthyModels.map((m) => (
                  <div key={m.model} className="flex items-center justify-between py-1">
                    <div>
                      <span className="text-sm">{modelGroupLabel(m.modelGroup)}</span>
                      <span className="text-xs text-muted-foreground ml-2">{m.model}</span>
                    </div>
                    <Badge variant="default" className="bg-green-600">Healthy</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Model routing table */}
          <div>
            <h3 className="text-sm font-medium mb-2">Model Routing</h3>
            <div className="border rounded-md overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Task</th>
                    <th className="text-left px-3 py-2 font-medium">Model</th>
                    <th className="text-left px-3 py-2 font-medium">Provider</th>
                    <th className="text-left px-3 py-2 font-medium">Fallback</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {TASK_MODEL_MAP.map((row) => {
                    const isLocalRow = row.model.startsWith("local-")
                    const disabled = isLocalRow && !useLocalModels
                    // Check if the primary model for this row is unhealthy
                    const modelUnhealthy = unhealthyModels.some(
                      (m) => m.modelGroup === row.model
                    )
                    return (
                      <tr key={row.task} className={disabled ? "opacity-50" : undefined}>
                        <td className="px-3 py-2 font-mono text-xs">{row.task}</td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {disabled ? (
                            <span>
                              <s>{row.model}</s>{" "}
                              <span className="text-muted-foreground">→ gemini-general</span>
                            </span>
                          ) : (
                            <span>
                              {row.model}
                              {modelUnhealthy && (
                                <Badge variant="destructive" className="ml-2 text-[10px] px-1 py-0">down</Badge>
                              )}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {disabled ? <span className="text-muted-foreground">Gemini 2.5 Flash</span> : row.provider}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{row.fallback}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
