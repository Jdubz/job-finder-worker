import { useEffect, useState, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Loader2 } from "lucide-react"
import { queueClient } from "@/api/queue-client"
import type { AgentCliHealth } from "@shared/types"

// Keep in sync with infra/litellm-config.yaml and worker ai/task_router.py TASK_MODEL_MAP
const TASK_MODEL_MAP = [
  { task: "extraction", model: "local-extract", provider: "Ollama Llama 3.1", fallback: "gemini, claude" },
  { task: "document", model: "claude-document", provider: "Claude Sonnet", fallback: "gemini" },
  { task: "chat", model: "claude-document", provider: "Claude Sonnet", fallback: "gemini" },
  { task: "default", model: "gemini-general", provider: "Gemini 2.5 Flash", fallback: "—" },
] as const

const REFRESH_INTERVAL_MS = 30_000

export function LlmStatusTab() {
  const [health, setHealth] = useState<AgentCliHealth | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchHealth = useCallback(async () => {
    try {
      const data = await queueClient.getAgentCliHealth()
      setHealth(data)
      setError(null)
    } catch {
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>LLM Status</CardTitle>
        <CardDescription>
          Read-only view of LiteLLM proxy health and model routing. Auto-refreshes every 30s.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Proxy health */}
        <div>
          <h3 className="text-sm font-medium mb-2">LiteLLM Proxy Health</h3>
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
                {TASK_MODEL_MAP.map((row) => (
                  <tr key={row.task}>
                    <td className="px-3 py-2 font-mono text-xs">{row.task}</td>
                    <td className="px-3 py-2 font-mono text-xs">{row.model}</td>
                    <td className="px-3 py-2">{row.provider}</td>
                    <td className="px-3 py-2 text-muted-foreground">{row.fallback}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Per-model health */}
        <div>
          <h3 className="text-sm font-medium mb-2">Per-Model Health</h3>
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : !health?.worker?.providers ? (
            <p className="text-sm text-muted-foreground">No provider health data available</p>
          ) : (
            <div className="space-y-2">
              {Object.entries(health.worker.providers).map(([provider, status]) => (
                <div key={provider} className="flex items-center justify-between">
                  <span className="text-sm capitalize">{provider}</span>
                  {status.healthy ? (
                    <Badge variant="default" className="bg-green-600">Healthy</Badge>
                  ) : (
                    <Badge variant="destructive">{status.message || "Unhealthy"}</Badge>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
