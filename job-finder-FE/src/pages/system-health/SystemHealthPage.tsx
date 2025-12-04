import { useState, useEffect, useCallback } from "react"
import { useAuth } from "@/contexts/AuthContext"
import {
  queueClient,
  type CronStatusResponse,
  type WorkerHealthResponse,
  type CronTriggerResponse,
  type CliHealthResponse
} from "@/api/queue-client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
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
  Cpu
} from "lucide-react"

const REFRESH_INTERVAL_MS = 30000 // 30 seconds

export function SystemHealthPage() {
  const { user, isOwner } = useAuth()

  const [cronStatus, setCronStatus] = useState<CronStatusResponse | null>(null)
  const [workerHealth, setWorkerHealth] = useState<WorkerHealthResponse | null>(null)
  const [cliHealth, setCliHealth] = useState<CliHealthResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [alert, setAlert] = useState<{ type: "success" | "error"; message: string } | null>(null)
  const [triggeringCron, setTriggeringCron] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  const fetchHealth = useCallback(async () => {
    try {
      setError(null)
      const [cron, worker, cli] = await Promise.all([
        queueClient.getCronStatus(),
        queueClient.getWorkerHealth(),
        queueClient.getCliHealth()
      ])
      setCronStatus(cron)
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

  const handleTriggerCron = async (type: "scrape" | "maintenance") => {
    setTriggeringCron(type)
    setAlert(null)
    try {
      let result: CronTriggerResponse
      if (type === "scrape") {
        result = await queueClient.triggerCronScrape()
      } else {
        result = await queueClient.triggerCronMaintenance()
      }

      if (result.success) {
        setAlert({
          type: "success",
          message: type === "scrape"
            ? `Scrape job queued (ID: ${result.queueItemId})`
            : "Maintenance triggered successfully"
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
            Monitor cron scheduler and worker status
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

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
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
              ) : cronStatus?.enabled ? (
                <Badge variant="secondary">Enabled (Not Started)</Badge>
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
                    <span className="text-muted-foreground">Enabled</span>
                    <span>{cronStatus.enabled ? "Yes" : "No"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Started</span>
                    <span>{cronStatus.started ? "Yes" : "No"}</span>
                  </div>
                </div>

                <div className="border-t pt-4 space-y-2">
                  <h4 className="font-medium text-sm">Schedules (UTC)</h4>
                  <div className="space-y-1 text-sm font-mono">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Scrape</span>
                      <span>{cronStatus.expressions.scrape}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Maintenance</span>
                      <span>{cronStatus.expressions.maintenance}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Log Rotate</span>
                      <span>{cronStatus.expressions.logrotate}</span>
                    </div>
                  </div>
                </div>

                <div className="border-t pt-4 flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleTriggerCron("scrape")}
                    disabled={triggeringCron !== null}
                  >
                    {triggeringCron === "scrape" ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4 mr-2" />
                    )}
                    Trigger Scrape
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleTriggerCron("maintenance")}
                    disabled={triggeringCron !== null}
                  >
                    {triggeringCron === "maintenance" ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4 mr-2" />
                    )}
                    Trigger Maintenance
                  </Button>
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

        {/* CLI Health Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cpu className="h-5 w-5" />
                <CardTitle>AI Providers</CardTitle>
              </div>
              {loading ? (
                <Skeleton className="h-6 w-20" />
              ) : cliHealth?.reachable ? (
                <Badge variant="default" className="bg-green-600">Connected</Badge>
              ) : (
                <Badge variant="destructive">Unreachable</Badge>
              )}
            </div>
            <CardDescription>
              CLI and API provider authentication status
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
              <>
                {!cliHealth.reachable ? (
                  <Alert variant="destructive">
                    <XCircle className="h-4 w-4" />
                    <AlertDescription>
                      Cannot reach worker at {cliHealth.workerUrl}
                      {cliHealth.error && `: ${cliHealth.error}`}
                    </AlertDescription>
                  </Alert>
                ) : (
                  <div className="space-y-3">
                    {cliHealth.providers && Object.entries(cliHealth.providers).map(([name, provider]) => (
                      <div key={name} className="flex items-center justify-between py-2 border-b last:border-0">
                        <div className="flex items-center gap-2">
                          {provider.authenticated ? (
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                          ) : provider.available ? (
                            <AlertCircle className="h-4 w-4 text-yellow-600" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-600" />
                          )}
                          <span className="font-medium capitalize">{name}</span>
                        </div>
                        <div className="text-right">
                          <Badge
                            variant={provider.authenticated ? "default" : "secondary"}
                            className={provider.authenticated ? "bg-green-600" : ""}
                          >
                            {provider.authenticated ? "Authenticated" : provider.available ? "Not Authenticated" : "Unavailable"}
                          </Badge>
                          <p className="text-xs text-muted-foreground mt-1 max-w-[200px] truncate">
                            {provider.message}
                          </p>
                        </div>
                      </div>
                    ))}

                    {cliHealth.timestamp && (
                      <div className="text-xs text-muted-foreground pt-2">
                        Last checked: {new Date(cliHealth.timestamp * 1000).toLocaleTimeString()}
                      </div>
                    )}
                  </div>
                )}
              </>
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
