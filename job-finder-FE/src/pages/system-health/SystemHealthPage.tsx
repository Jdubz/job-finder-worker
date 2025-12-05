import { useState, useEffect, useCallback } from "react"
import { useAuth } from "@/contexts/AuthContext"
import {
  queueClient,
  type CronStatus,
  type WorkerHealth,
  type CronTriggerResult
} from "@/api/queue-client"
import { configClient } from "@/api/config-client"
import type { AgentCliHealth, CronConfig } from "@shared/types"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import {
  AlertCircle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Play,
  Server,
  Clock,
  Loader2,
  Activity,
  TerminalSquare
} from "lucide-react"

const REFRESH_INTERVAL_MS = 30000 // 30 seconds
type CronJobKey = keyof CronConfig["jobs"]

const CRON_JOB_LABELS: Record<CronJobKey, string> = {
  scrape: "Scrape Jobs",
  maintenance: "Maintenance",
  logrotate: "Log Rotation",
  agentReset: "Agent Reset",
  gmailIngest: "Gmail Ingest"
}

function formatHoursInput(hours: number[]): string {
  return [...hours].sort((a, b) => a - b).join(", ")
}

function parseHours(input: string): number[] {
  const tokens = input
    .split(/[,\s]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => Number(t))

  if (tokens.length === 0) return []

  for (const h of tokens) {
    if (!Number.isInteger(h) || h < 0 || h > 23) {
      throw new Error("Hours must be integers between 0 and 23")
    }
  }

  return Array.from(new Set(tokens)).sort((a, b) => a - b)
}

export function SystemHealthPage() {
  const { user, isOwner } = useAuth()

  const [cronStatus, setCronStatus] = useState<CronStatus | null>(null)
  const [cronConfig, setCronConfig] = useState<CronConfig | null>(null)
  const [workerHealth, setWorkerHealth] = useState<WorkerHealth | null>(null)
  const [cliHealth, setCliHealth] = useState<AgentCliHealth | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [alert, setAlert] = useState<{ type: "success" | "error"; message: string } | null>(null)
  const [triggeringCron, setTriggeringCron] = useState<string | null>(null)
  const [savingJob, setSavingJob] = useState<string | null>(null)
  const [hourInputs, setHourInputs] = useState<Record<string, string>>({})
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  const fetchHealth = useCallback(async () => {
    try {
      setError(null)
      const [cron, worker, cli, cfg] = await Promise.all([
        queueClient.getCronStatus(),
        queueClient.getWorkerHealth(),
        queueClient.getAgentCliHealth(),
        configClient.getCronConfig().catch(() => null)
      ])

      const derivedConfig: CronConfig | null = cfg ?? (cron ? { jobs: { ...cron.jobs, gmailIngest: cron.jobs.gmailIngest ?? { enabled: false, hours: [], lastRun: null } } } : null)

      setCronStatus(cron)
      setCronConfig(derivedConfig)
      setHourInputs(
        derivedConfig
          ? {
              scrape: formatHoursInput(derivedConfig.jobs.scrape.hours),
              maintenance: formatHoursInput(derivedConfig.jobs.maintenance.hours),
              logrotate: formatHoursInput(derivedConfig.jobs.logrotate.hours),
              agentReset: formatHoursInput(derivedConfig.jobs.agentReset.hours),
              gmailIngest: formatHoursInput(derivedConfig.jobs.gmailIngest.hours),
            }
          : {}
      )
      setWorkerHealth(worker)
      setCliHealth(cli)
      setLastRefresh(new Date())
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch health status")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!user || !isOwner) return
    fetchHealth()

    const interval = setInterval(fetchHealth, REFRESH_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [user, isOwner, fetchHealth])

  const handleTriggerCron = async (type: CronJobKey) => {
    setTriggeringCron(type)
    setAlert(null)
    try {
      let result: CronTriggerResult
      if (type === "scrape") result = await queueClient.triggerCronScrape()
      else if (type === "maintenance") result = await queueClient.triggerCronMaintenance()
      else result = await queueClient.triggerCronLogrotate()

      if (result.success) {
        setAlert({
          type: "success",
          message: type === "scrape"
            ? `Scrape job queued (ID: ${result.queueItemId})`
            : "Job triggered successfully"
        })
      } else {
        setAlert({ type: "error", message: result.error ?? "Unknown error" })
      }
    } catch (err) {
      setAlert({ type: "error", message: err instanceof Error ? err.message : "Failed to trigger cron" })
    } finally {
      setTriggeringCron(null)
    }
  }

  const saveCronConfig = async (config: CronConfig, job: string) => {
    setSavingJob(job)
    setAlert(null)
    try {
      await configClient.updateCronConfig(config)
      setCronConfig(config)
      setAlert({ type: "success", message: "Scheduler updated" })
      await fetchHealth()
    } catch (err) {
      setAlert({ type: "error", message: err instanceof Error ? err.message : "Failed to save scheduler" })
    } finally {
      setSavingJob(null)
    }
  }

  const handleToggleJob = async (job: CronJobKey, enabled: boolean) => {
    const base = cronConfig ?? (cronStatus ? { jobs: cronStatus.jobs } : null)
    if (!base) return
    try {
      const hours = parseHours(hourInputs[job] ?? formatHoursInput(base.jobs[job].hours))
      const next: CronConfig = {
        jobs: {
          ...base.jobs,
          [job]: { ...base.jobs[job], enabled, hours }
        }
      }
      await saveCronConfig(next, job)
    } catch (err) {
      setAlert({ type: "error", message: err instanceof Error ? err.message : "Invalid hours" })
    }
  }

  const handleSaveHours = async (job: CronJobKey) => {
    const base = cronConfig ?? (cronStatus ? { jobs: cronStatus.jobs } : null)
    if (!base) return
    try {
      const hours = parseHours(hourInputs[job] ?? "")
      const next: CronConfig = {
        jobs: {
          ...base.jobs,
          [job]: { ...base.jobs[job], hours }
        }
      }
      await saveCronConfig(next, job)
    } catch (err) {
      setAlert({ type: "error", message: err instanceof Error ? err.message : "Invalid hours" })
    }
  }

  const overallCliHealthy = cliHealth
    ? Object.values(cliHealth.backend).every((s) => s.healthy) &&
      cliHealth.worker.reachable &&
      !!cliHealth.worker.providers &&
      Object.values(cliHealth.worker.providers).every((s) => s.healthy)
    : false

  if (!user) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>Please sign in to view system health.</AlertDescription>
      </Alert>
    )
  }

  if (!isOwner) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>Admin access required to view system health.</AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">System Health</h1>
          <p className="text-muted-foreground">
            Monitor cron scheduler, worker, and agent CLI status
          </p>
        </div>
        <div className="flex items-center gap-2">
          {lastRefresh && (
            <span className="text-sm text-muted-foreground">
              Last updated: {lastRefresh.toLocaleTimeString()}
            </span>
          )}
          <Button variant="outline" size="sm" onClick={fetchHealth} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </header>

      {alert && (
        <Alert variant={alert.type === "error" ? "destructive" : "default"}>
          {alert.type === "error" ? (
            <AlertCircle className="h-4 w-4" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}
          <AlertDescription>{alert.message}</AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {/* Cron Scheduler Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                <CardTitle>Cron Scheduler</CardTitle>
              </div>
              {loading ? (
                <Skeleton className="h-6 w-20" />
              ) : cronStatus?.started ? (
                <Badge variant="default" className="bg-green-600">Running</Badge>
              ) : (
                <Badge variant="destructive">Disabled</Badge>
              )}
            </div>
            <CardDescription>
              Scheduled jobs for scraping, maintenance, and log rotation
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ) : cronStatus ? (
              <>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Environment</span>
                    <Badge variant="outline">{cronStatus.nodeEnv}</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Started</span>
                    <span>{cronStatus.started ? "Yes" : "No"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Timezone</span>
                    <span>{cronStatus.timezone}</span>
                  </div>
                </div>

                <div className="border-t pt-4 space-y-4">
                  {cronConfig && (
                    <div className="grid gap-4">
                      {(Object.keys(cronConfig.jobs) as CronJobKey[]).map((key) => {
                        const job = cronConfig.jobs[key]
                        return (
                          <div key={key} className="border rounded-lg p-4 space-y-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{CRON_JOB_LABELS[key]}</span>
                                <Badge variant="outline" className="text-[11px]">
                                  Last run: {job.lastRun ? new Date(job.lastRun).toLocaleString() : "Never"}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-muted-foreground text-sm">Enabled</span>
                                <Checkbox
                                  checked={job.enabled}
                                  onCheckedChange={(checked) => handleToggleJob(key, checked === true)}
                                  disabled={savingJob === key || loading}
                                />
                              </div>
                            </div>

                            <div className="grid md:grid-cols-[1fr_auto_auto] gap-2 items-center">
                              <div className="space-y-1">
                                <span className="text-xs text-muted-foreground">Run at hours (0-23, comma separated)</span>
                                <Input
                                  value={hourInputs[key] ?? ""}
                                  onChange={(e) => setHourInputs((prev) => ({ ...prev, [key]: e.target.value }))}
                                  disabled={savingJob === key || loading}
                                />
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleSaveHours(key)}
                                disabled={savingJob === key || loading}
                              >
                                {savingJob === key ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                                Save
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => handleTriggerCron(key)}
                                disabled={triggeringCron !== null || loading}
                              >
                                {triggeringCron === key ? (
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                ) : (
                                  <Play className="h-4 w-4 mr-2" />
                                )}
                                Run Now
                              </Button>
                            </div>

                            <div className="text-xs text-muted-foreground font-mono">
                              Scheduled hours: {formatHoursInput(job.hours) || "None"}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </>
            ) : null}
          </CardContent>
        </Card>

        {/* Worker Health Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Server className="h-5 w-5" />
                <CardTitle>Worker</CardTitle>
              </div>
              {loading ? (
                <Skeleton className="h-6 w-20" />
              ) : workerHealth?.reachable ? (
                workerHealth.health?.running ? (
                  <Badge variant="default" className="bg-green-600">Running</Badge>
                ) : (
                  <Badge variant="secondary">Stopped</Badge>
                )
              ) : (
                <Badge variant="destructive">Unreachable</Badge>
              )}
            </div>
            <CardDescription>
              Python worker processing queue items
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ) : workerHealth ? (
              <>
                {!workerHealth.reachable ? (
                  <Alert variant="destructive">
                    <XCircle className="h-4 w-4" />
                    <AlertDescription>
                      Cannot reach worker at {workerHealth.workerUrl}
                      {workerHealth.error && `: ${workerHealth.error}`}
                    </AlertDescription>
                  </Alert>
                ) : (
                  <>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Status</span>
                        <span className="flex items-center gap-1">
                          {workerHealth.health?.status === "healthy" ? (
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-600" />
                          )}
                          {workerHealth.health?.status}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Items Processed</span>
                        <span>{workerHealth.health?.items_processed ?? 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Iteration</span>
                        <span>{workerHealth.health?.iteration ?? 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Last Poll</span>
                        <span className="text-xs">
                          {workerHealth.health?.last_poll
                            ? new Date(workerHealth.health.last_poll).toLocaleString()
                            : "Never"}
                        </span>
                      </div>
                      {workerHealth.status?.uptime !== undefined && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Uptime</span>
                          <span>{formatUptime(workerHealth.status.uptime)}</span>
                        </div>
                      )}
                    </div>

                    {workerHealth.health?.last_error && (
                      <Alert variant="destructive" className="mt-4">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription className="text-xs font-mono">
                          {workerHealth.health.last_error}
                        </AlertDescription>
                      </Alert>
                    )}

                    {workerHealth.status?.queue && (
                      <div className="border-t pt-4 space-y-2">
                        <h4 className="font-medium text-sm flex items-center gap-2">
                          <Activity className="h-4 w-4" />
                          Queue Stats
                        </h4>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          {Object.entries(workerHealth.status.queue).map(([key, value]) => (
                            <div key={key} className="flex justify-between">
                              <span className="text-muted-foreground capitalize">
                                {key.replace(/_/g, " ")}
                              </span>
                              <span>{String(value)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </>
            ) : null}
          </CardContent>
        </Card>

        {/* Agent CLI Health Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TerminalSquare className="h-5 w-5" />
                <CardTitle>Agent CLI Tools</CardTitle>
              </div>
              {loading ? (
                <Skeleton className="h-6 w-20" />
              ) : cliHealth ? (
                overallCliHealthy ? (
                  <Badge variant="default" className="bg-green-600">Healthy</Badge>
                ) : (
                  <Badge variant="destructive">Attention</Badge>
                )
              ) : (
                <Badge variant="secondary">Unknown</Badge>
              )}
            </div>
            <CardDescription>
              Authentication and availability checks for codex and gemini CLIs
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ) : cliHealth ? (
              <div className="space-y-4 text-sm">
                <div className="space-y-2">
                  <h4 className="font-medium text-sm">Backend API Host</h4>
                  {Object.entries(cliHealth.backend).map(([provider, status]) => (
                    <div key={provider} className="flex items-start justify-between gap-2">
                      <span className="text-muted-foreground capitalize">{provider}</span>
                      <div className="flex items-center gap-2 text-xs text-right max-w-[260px]">
                        {status.healthy ? (
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-600" />
                        )}
                        <span className="text-muted-foreground break-words">{status.message}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium text-sm">Worker</h4>
                    {cliHealth.worker.workerUrl && (
                      <Badge variant="outline" className="text-[10px]">{cliHealth.worker.workerUrl}</Badge>
                    )}
                  </div>

                  {!cliHealth.worker.reachable ? (
                    <Alert variant="destructive">
                      <XCircle className="h-4 w-4" />
                      <AlertDescription>
                        Cannot reach worker CLI endpoint
                        {cliHealth.worker.error ? `: ${cliHealth.worker.error}` : ""}
                      </AlertDescription>
                    </Alert>
                  ) : cliHealth.worker.providers ? (
                    Object.entries(cliHealth.worker.providers).map(([provider, status]) => (
                      <div key={provider} className="flex items-start justify-between gap-2">
                        <span className="text-muted-foreground capitalize">{provider}</span>
                        <div className="flex items-center gap-2 text-xs text-right max-w-[260px]">
                          {status.healthy ? (
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-600" />
                          )}
                          <span className="text-muted-foreground break-words">{status.message}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>No CLI status reported from worker</AlertDescription>
                    </Alert>
                  )}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`
  } else if (hours > 0) {
    return `${hours}h ${minutes}m`
  } else {
    return `${minutes}m`
  }
}
